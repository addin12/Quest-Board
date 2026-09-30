// Server-side mail logic against a real (temporary) database and a fake email provider.
// Runs because `npm test` uses --conditions=react-server, where "server-only" is a no-op.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-mail-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
process.env.RESEND_API_KEY = "test-key";
process.env.QUESTBOARD_MAIL_FROM = "Quest Board <test@example.com>";
process.env.QUESTBOARD_ENFORCE_HTTPS = "true"; // like production: the dev outbox is off, so one-time links are blanked

let failNext = 0;
const sent: { to: string[]; subject: string; headers?: Record<string, string> }[] = [];
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  if (failNext > 0) { failNext--; return new Response("provider down", { status: 503 }); }
  sent.push(JSON.parse(init.body));
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;

const { db } = await import("../../src/lib/db.ts");
const { sendEmail, retryFailedEmails, MAX_ATTEMPTS } = await import("../../src/lib/mailer.ts");
const row = (subject: string) => db().prepare("SELECT sent_at, error, attempts, retryable, body_text FROM email_outbox WHERE subject = ?").get(subject) as
  { sent_at: string | null; error: string | null; attempts: number; retryable: number; body_text: string };

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
