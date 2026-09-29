// Daily error digest to admins, against a temporary database and a fake email provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-digest-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
process.env.RESEND_API_KEY = "test-key";
process.env.QUESTBOARD_MAIL_FROM = "Quest Board <test@example.com>";
const sent: { to: string[]; subject: string; text: string }[] = [];
globalThis.fetch = (async (_u: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;

const { db } = await import("../../src/lib/db.ts");
const { sendErrorDigest } = await import("../../src/lib/error-digest.ts");

const H = 3_600_000;
const t0 = new Date("2026-10-10T08:00:00Z").getTime();
const err = (msg: string, at: number) => db().prepare("INSERT INTO error_log (message, route_path, created_at) VALUES (?, '/games/[slug]', ?)").run(msg, new Date(at).toISOString());

test("admins get one summary a day, only when there were errors", async () => {
  db().prepare("INSERT INTO users (email, password_hash, name, role, email_verified_at, locale) VALUES ('a1@x.test', 'x', 'Ana', 'admin', ?, 'en'), ('a2@x.test', 'x', 'Bayu', 'admin', ?, 'id'), ('p@x.test', 'x', 'Player', 'player', ?, 'en')")
    .run(new Date(t0).toISOString(), new Date(t0).toISOString(), new Date(t0).toISOString());
  assert.equal(await sendErrorDigest("https://qb.test", new Date(t0)), 0); // nothing logged: no email

  for (let i = 0; i < 3; i++) err("TypeError: cannot read x", t0 + H + i);
  err("SqliteError: disk I/O", t0 + 2 * H);
  assert.equal(await sendErrorDigest("https://qb.test", new Date(t0 + 3 * H)), 2); // both admins, not the player
  const en = sent.find((m) => m.to.includes("a1@x.test"))!;
  assert.equal(en.subject, "Quest Board: 4 server errors since the last summary");
  assert.match(en.text, /• 3× TypeError: cannot read x \(\/games\/\[slug\]\)\n• 1× SqliteError/); // most frequent first
  assert.match(en.text, /https:\/\/qb\.test\/admin\/errors/);
  assert.match(sent.find((m) => m.to.includes("a2@x.test"))!.subject, /error server sejak ringkasan terakhir/);

  err("TypeError: cannot read x", t0 + 4 * H);
  assert.equal(await sendErrorDigest("https://qb.test", new Date(t0 + 5 * H)), 0); // too soon: at most daily
  assert.equal(await sendErrorDigest("https://qb.test", new Date(t0 + 26 * H)), 2); // next day: only the new one
  assert.match(sent.at(-1)!.subject, /1 server error since|1 error server sejak/);
});

test("emails the provider couldn't deliver are reported too, even without server errors", async () => {
  const at = t0 + 60 * H;
  db().prepare("INSERT INTO email_outbox (to_address, subject, body_text, created_at, error, attempts) VALUES ('p@x.test', 's', 'b', ?, 'Error: Resend 503: provider down', 3), ('p@x.test', 's', 'b', ?, 'Error: Resend 503: provider down', 1)")
    .run(new Date(at - H).toISOString(), new Date(at - 2 * H).toISOString());
  db().prepare("INSERT INTO email_outbox (to_address, subject, body_text, created_at, sent_at) VALUES ('p@x.test', 's', 'b', ?, ?)").run(new Date(at - H).toISOString(), new Date(at - H).toISOString()); // delivered: not counted
  const before = sent.length;
  assert.equal(await sendErrorDigest("https://qb.test", new Date(at)), 2);
  const en = sent.slice(before).find((m) => m.to.includes("a1@x.test"))!;
  assert.equal(en.subject, "Quest Board: 2 failed emails since the last summary");
  assert.match(en.text, /2 emails couldn't be delivered \(last error: Error: Resend 503: provider down\)/);
  assert.doesNotMatch(en.text, /The server logged/);
});
