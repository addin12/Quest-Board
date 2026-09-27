// Moderation and community notifications against a temporary database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-safety-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
process.env.RESEND_API_KEY = "test-key";
process.env.QUESTBOARD_MAIL_FROM = "Quest Board <test@example.com>";

const sent: { to: string[]; subject: string; text: string }[] = [];
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  sent.push(JSON.parse(init.body));
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;

const { db } = await import("../../src/lib/db.ts");
const { suspendUser } = await import("../../src/lib/moderation.ts");
const { getPaymentInfo } = await import("../../src/lib/queries.ts");
const { addReply, createNotice } = await import("../../src/lib/community.ts");
const { deliverNotificationEmails } = await import("../../src/lib/notification-mail.ts");

const verified = new Date().toISOString();
const user = (email: string, emailNotifications = 1) => Number(db().prepare(
  "INSERT INTO users (email, password_hash, name, email_verified_at, email_notifications) VALUES (?, 'x', ?, ?, ?)",
).run(email, email.split("@")[0], verified, emailNotifications).lastInsertRowid);
const kinds = (userId: number) => (db().prepare("SELECT kind FROM notifications WHERE user_id = ? ORDER BY id").all(userId) as { kind: string }[]).map((n) => n.kind);

test("suspending a GM hides their payment details and warns their players and requesters not to pay", async () => {
  const gm = user("scammer@x.test");
  const admin = user("admin@x.test");
  db().prepare("UPDATE users SET role = 'gm' WHERE id = ?").run(gm);
  db().prepare("INSERT INTO gm_profiles (user_id, headline, payment_info) VALUES (?, 'Great games', 'BCA 123 a.n. Scammer')").run(gm);
  const player = user("player@x.test", 0); // turned notification emails off
  const requester = user("requester@x.test");
  const bystander = user("bystander@x.test");
  const game = Number(db().prepare(
    "INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, price_idr, seats_total, status) VALUES (?, 'g', 'Game', 'D&D 5e (2014)', 's', 'd', 'one_shot', 'online', 'id', 50000, 5, 'published')",
  ).run(gm).lastInsertRowid);
  const session = Number(db().prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game, new Date(Date.now() + 3 * 86_400_000).toISOString()).lastInsertRowid);
  db().prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 50000)").run(session, player);
  db().prepare("INSERT INTO gm_requests (requester_id, title, system, group_size, schedule, details, status, matched_gm_id) VALUES (?, 'Our campaign', 'D&D 5e (2014)', 4, 'Fridays', 'A long campaign for our group of friends.', 'matched', ?)").run(requester, gm);

  assert.equal(getPaymentInfo(gm), "BCA 123 a.n. Scammer");
  assert.equal(suspendUser(gm, admin), true);
  assert.equal(getPaymentInfo(gm), "");
  assert.ok(kinds(player).includes("gm_suspended"));
  assert.ok(kinds(player).includes("session_cancelled"));
  assert.deepEqual(kinds(requester), ["gm_suspended"]);
  assert.deepEqual(kinds(bystander), []);

  await deliverNotificationEmails("https://qb.test");
  const warning = sent.find((m) => m.to.includes("player@x.test") && m.subject.startsWith("Warning"));
  assert.ok(warning, "sent even though the player turned notification emails off");
  assert.equal(warning.subject, "Warning: don't send money to scammer");
  assert.match(warning.text, /Don't send them any money/);
  assert.doesNotMatch(warning.text, /\.\./); // no doubled full stop
  assert.match(warning.text, /We send this even if you turned notification emails off/);
  assert.doesNotMatch(warning.text, /turn these emails off/);
  assert.ok(sent.some((m) => m.to.includes("requester@x.test") && m.subject.startsWith("Warning")));
});

test("a reply on a notice reaches its author and everyone who replied before", () => {
  const author = user("author@x.test");
  const a = user("a@x.test");
  const b = user("b@x.test");
  const post = createNotice(author, { kind: "lf_players", title: "Need two players", system: "", locationType: "online", city: "", language: "id", schedule: "Saturdays", spots: 2, body: "Friendly group, beginners welcome, every Saturday night." });
  addReply(post, a, "I'm in!");
  assert.deepEqual(kinds(author), ["lfg_reply"]);
  addReply(post, author, "Great, welcome!");
  assert.deepEqual(kinds(a), ["lfg_thread_reply"]); // the author answered A
  addReply(post, b, "Me too please");
  assert.deepEqual(kinds(a), ["lfg_thread_reply"]); // collapsed while unread
  assert.deepEqual(kinds(author), ["lfg_reply"]);
  assert.deepEqual(kinds(b), []); // not told about their own reply
});
