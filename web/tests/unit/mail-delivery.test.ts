// Server-side mail logic against a real (temporary) database and a fake email provider.
// Runs because `npm test` uses --conditions=react-server, where "server-only" is a no-op.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-mail-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
process.env.RESEND_API_KEY = "test-key";
process.env.QUESTBOARD_MAIL_FROM = "Quest Board <test@example.com>";
process.env.QUESTBOARD_ENFORCE_HTTPS = "true"; // like production: the dev outbox is off, so one-time links are blanked

let failNext = 0; // Resend answers 503 this many times
let resendStatus = 0; // or always this status (429 = its daily limit), when set
const sent: { to: string[]; subject: string; headers?: Record<string, string> }[] = [];
const viaBrevo: { to: { email: string }[]; subject: string; sender: { name?: string; email: string }; textContent: string; htmlContent: string; headers?: Record<string, string> }[] = [];
globalThis.fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
  if (String(url).startsWith("https://api.brevo.com/")) {
    assert.equal(init.headers["api-key"], "brevo-key");
    viaBrevo.push(JSON.parse(init.body));
    return new Response('{"messageId":"x"}', { status: 201 });
  }
  if (resendStatus) return new Response("limit", { status: resendStatus });
  if (failNext > 0) { failNext--; return new Response("provider down", { status: 503 }); }
  sent.push(JSON.parse(init.body));
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;

const { db } = await import("../../src/lib/db.ts");
const { providerBreaker, sendEmail, retryFailedEmails, MAX_ATTEMPTS } = await import("../../src/lib/mailer.ts");
// Each test starts with every provider trusted again (the breaker test below trips it on purpose).
beforeEach(() => providerBreaker.reset());
const row = (subject: string) => db().prepare("SELECT sent_at, error, attempts, retryable, body_text, provider, deferred FROM email_outbox WHERE subject = ?").get(subject) as
  { sent_at: string | null; error: string | null; attempts: number; retryable: number; body_text: string; provider: string | null; deferred: number };

before(() => { db(); });

test("a failed delivery is retried by the cron until it succeeds, then left alone", async () => {
  failNext = 2;
  await sendEmail({ to: "a@x.test", subject: "Retry me", text: "hello" });
  assert.equal(row("Retry me").sent_at, null);
  assert.equal(row("Retry me").attempts, 1);
  assert.equal(await retryFailedEmails(), 0); // provider still down (attempt 2)
  assert.equal(await retryFailedEmails(), 1); // back up (attempt 3)
  assert.ok(row("Retry me").sent_at);
  assert.equal(row("Retry me").error, null);
  assert.equal(await retryFailedEmails(), 0); // nothing left to retry
  assert.equal(sent.filter((m) => m.subject === "Retry me").length, 1);
  // Sent as plain text plus the same text laid out as HTML.
  const delivered = sent.find((m) => m.subject === "Retry me") as unknown as { text: string; html: string };
  assert.equal(delivered.text, "hello");
  assert.match(delivered.html, /<!doctype html>[\s\S]*hello/);
});

test(`retries stop after ${MAX_ATTEMPTS} attempts; blanked one-time links are never resent`, async () => {
  failNext = 10;
  await sendEmail({ to: "b@x.test", subject: "Give up", text: "x" });
  for (let i = 0; i < 5; i++) await retryFailedEmails();
  assert.equal(row("Give up").attempts, MAX_ATTEMPTS);
  assert.equal(row("Give up").sent_at, null);

  failNext = 1;
  await sendEmail({ to: "c@x.test", subject: "Reset link", text: "Open https://qb.test/reset?token=SECRET", secret: "https://qb.test/reset?token=SECRET" });
  assert.equal(row("Reset link").retryable, 0);
  assert.match(row("Reset link").body_text, /\[link removed\]/);
  failNext = 0;
  await retryFailedEmails();
  assert.equal(row("Reset link").sent_at, null); // would have been useless without the link
});

test("extra headers (List-Unsubscribe) reach the provider, also when the email is retried", async () => {
  const headers = { "List-Unsubscribe": "<https://qb.test/api/unsubscribe?u=1&k=reminders&t=x>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  failNext = 1;
  await sendEmail({ to: "h@x.test", subject: "With headers", text: "hello", headers });
  assert.equal(await retryFailedEmails(), 1);
  const copies = sent.filter((m) => m.subject === "With headers");
  assert.equal(copies.length, 1);
  assert.deepEqual(copies[0].headers, headers);
  await sendEmail({ to: "h@x.test", subject: "No headers", text: "hello" });
  assert.equal(sent.find((m) => m.subject === "No headers")!.headers, undefined);
});

test("Brevo takes over when Resend is down or full, and is counted separately", async () => {
  process.env.BREVO_API_KEY = "brevo-key";
  try {
    failNext = 1;
    await sendEmail({ to: "d@x.test", subject: "Resend down", text: "hello" });
    assert.equal(row("Resend down").provider, "brevo");
    assert.equal(row("Resend down").error, null);
    const b = viaBrevo.find((m) => m.subject === "Resend down")!;
    assert.deepEqual(b.sender, { name: "Quest Board", email: "test@example.com" });
    assert.deepEqual(b.to, [{ email: "d@x.test" }]);
    assert.equal(b.textContent, "hello");
    assert.match(b.htmlContent, /hello/);

    resendStatus = 429; // Resend's own daily limit: not an error, just full
    await sendEmail({ to: "d@x.test", subject: "Resend full", text: "hello", headers: { "List-Unsubscribe": "<https://x>" } });
    assert.equal(row("Resend full").provider, "brevo");
    assert.deepEqual(viaBrevo.find((m) => m.subject === "Resend full")!.headers, { "List-Unsubscribe": "<https://x>" });
    resendStatus = 0;
    await sendEmail({ to: "d@x.test", subject: "Resend back", text: "hello" });
    assert.equal(row("Resend back").provider, "resend");
  } finally {
    delete process.env.BREVO_API_KEY;
  }
});

test("near the daily limit optional emails wait (important ones still go), then go out once there's room", async () => {
  // Fill today's Resend count up to 80 of 100: the reserve for important emails starts there.
  const filled = db().prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE provider = 'resend' AND sent_at IS NOT NULL").get() as { n: number };
  const fill = db().prepare("INSERT INTO email_outbox (to_address, subject, body_text, sent_at, provider) VALUES ('f@x.test', 'filler', 'x', ?, 'resend')");
  for (let i = filled.n; i < 80; i++) fill.run(new Date().toISOString());

  await sendEmail({ to: "e@x.test", subject: "Reminder waits", text: "x", optional: true, expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
  assert.equal(row("Reminder waits").sent_at, null);
  assert.equal(row("Reminder waits").deferred, 1);
  assert.equal(row("Reminder waits").error, null); // waiting is not failing
  assert.equal(row("Reminder waits").attempts, 0);
  await sendEmail({ to: "e@x.test", subject: "Reset goes", text: "x" });
  assert.equal(row("Reset goes").provider, "resend");

  await sendEmail({ to: "e@x.test", subject: "Too late", text: "x", optional: true, expiresAt: new Date(Date.now() + 1_000).toISOString() });
  assert.equal(row("Too late").deferred, 1);

  // Room again (the filler ages out of the 24 hours): the waiting one goes, the expired one never does.
  db().prepare("UPDATE email_outbox SET sent_at = ? WHERE subject = 'filler'").run(new Date(Date.now() - 2 * 86_400_000).toISOString());
  await new Promise((r) => setTimeout(r, 1_100));
  await retryFailedEmails();
  assert.equal(row("Reminder waits").provider, "resend");
  assert.equal(row("Reminder waits").deferred, 0);
  assert.equal(row("Too late").sent_at, null);
});

test("when every provider is full, important emails wait too and go first when there's room", async () => {
  process.env.RESEND_DAILY_LIMIT = "1";
  try {
    // Start from an empty day, then use up the one slot.
    db().prepare("UPDATE email_outbox SET sent_at = ? WHERE sent_at IS NOT NULL").run(new Date(Date.now() - 2 * 86_400_000).toISOString());
    db().prepare("INSERT INTO email_outbox (to_address, subject, body_text, sent_at, provider) VALUES ('f@x.test', 'filler2', 'x', ?, 'resend')").run(new Date().toISOString());
    await sendEmail({ to: "g@x.test", subject: "Optional first in line", text: "x", optional: true });
    await sendEmail({ to: "g@x.test", subject: "Important later in line", text: "x" });
    assert.equal(row("Important later in line").deferred, 1);
    db().prepare("UPDATE email_outbox SET sent_at = ? WHERE subject IN ('filler2')").run(new Date(Date.now() - 2 * 86_400_000).toISOString());
    // One slot: the important one takes it even though it was queued later.
    await retryFailedEmails();
    assert.equal(row("Important later in line").provider, "resend");
    assert.equal(row("Optional first in line").sent_at, null);
  } finally {
    delete process.env.RESEND_DAILY_LIMIT;
  }
});

test("optional emails don't go to an address that bounced or reported spam; important ones still do", async () => {
  const { recordEmailEvent, clearSuppression } = await import("../../src/lib/email-suppression.ts");
  recordEmailEvent({ emails: ["gone@x.test"], reason: "bounce", detail: "no such mailbox" }, "resend");
  await sendEmail({ to: "Gone@x.test", subject: "Optional to a dead address", text: "x", optional: true });
  const held = db().prepare("SELECT sent_at, suppressed, retryable, error FROM email_outbox WHERE subject = 'Optional to a dead address'").get() as { sent_at: string | null; suppressed: number; retryable: number; error: string | null };
  assert.deepEqual({ ...held }, { sent_at: null, suppressed: 1, retryable: 0, error: null }); // not a failure, never retried
  assert.equal(sent.some((m) => m.subject === "Optional to a dead address"), false);
  await sendEmail({ to: "gone@x.test", subject: "Password reset to a dead address", text: "x" });
  assert.ok(row("Password reset to a dead address").sent_at);
  clearSuppression("GONE@x.test");
  await sendEmail({ to: "gone@x.test", subject: "Optional again", text: "x", optional: true });
  assert.ok(row("Optional again").sent_at);
});

test("Resend gets the same idempotency key on a retry; a provider failing 3 times in a row is skipped for a while", async () => {
  const keys: { to: string; key: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    keys.push({ to: (JSON.parse(init.body).to ?? [])[0] ?? "", key: init.headers["Idempotency-Key"] });
    return real(url, init as unknown as RequestInit);
  }) as unknown as typeof fetch;
  try {
    failNext = 1;
    await sendEmail({ to: "idem@x.test", subject: "Idem", text: "hi" });
    await retryFailedEmails();
    const idem = keys.filter((k) => k.to === "idem@x.test").map((k) => k.key);
    assert.equal(idem.length, 2);
    assert.match(idem[0], /^qb-outbox-\d+$/);
    assert.equal(idem[0], idem[1]);

    keys.length = 0;
    failNext = 3;
    for (const n of [1, 2, 3]) await sendEmail({ to: `down${n}@x.test`, subject: "Down", text: "hi" });
    assert.equal(keys.length, 3);
    await sendEmail({ to: "skipped@x.test", subject: "Skipped", text: "hi" });
    assert.equal(keys.length, 3, "the 4th email doesn't wait for a provider that is down");
    const row = db().prepare("SELECT sent_at, deferred FROM email_outbox WHERE to_address = 'skipped@x.test'").get() as { sent_at: string | null; deferred: number };
    assert.deepEqual({ ...row }, { sent_at: null, deferred: 1 }); // the cron sends it once the provider is back
  } finally {
    globalThis.fetch = real;
  }
});
