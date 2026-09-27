// Cancelled sessions reach players by email from every path, not only the GM's "Cancel session" button.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-cancel-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
process.env.RESEND_API_KEY = "test-key";
process.env.QUESTBOARD_MAIL_FROM = "Quest Board <test@example.com>";

const sent: { to: string[]; subject: string; text: string }[] = [];
globalThis.fetch = (async (_url: string, init: { body: string }) => {
  sent.push(JSON.parse(init.body));
  return new Response("{}", { status: 200 });
}) as unknown as typeof fetch;

const { db, tx } = await import("../../src/lib/db.ts");
const { archiveGame } = await import("../../src/lib/account.ts");
const { deliverNotificationEmails } = await import("../../src/lib/notification-mail.ts");
const { listNotifications } = await import("../../src/lib/notifications.ts");
const { describeNotification } = await import("../../src/lib/notification-view.ts");
const { makeT } = await import("../../src/lib/i18n/dict.ts");

const verified = new Date().toISOString();
const user = (email: string, emailNotifications = 1) => Number(db().prepare(
  "INSERT INTO users (email, password_hash, name, email_verified_at, email_notifications) VALUES (?, 'x', ?, ?, ?)",
).run(email, email.split("@")[0], verified, emailNotifications).lastInsertRowid);

test("archiving a game emails booked players — even those who turned notification emails off — and never links to the gone page", async () => {
  const gm = user("gm@x.test");
  const quiet = user("quiet@x.test", 0);
  const game = Number(db().prepare(
    "INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, price_idr, seats_total, status) VALUES (?, 'naga', 'Naga', 'D&D 5e (2014)', 's', 'd', 'one_shot', 'in_person', 'id', 0, 5, 'published')",
  ).run(gm).lastInsertRowid);
  const session = Number(db().prepare("INSERT INTO game_sessions (game_id, starts_at) VALUES (?, ?)").run(game, new Date(Date.now() + 5 * 86_400_000).toISOString()).lastInsertRowid);
  db().prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(session, quiet);

  assert.equal(tx((c) => archiveGame(c, game, gm)), 1);
  assert.equal(await deliverNotificationEmails("https://qb.test"), 1);
  const mail = sent.find((m) => m.to.includes("quiet@x.test"));
  assert.ok(mail, "the cancellation was emailed");
  assert.match(mail.subject, /^Cancelled: Naga — /);
  assert.match(mail.text, /https:\/\/qb\.test\/games\n/); // other games, not the archived game's page
  assert.doesNotMatch(mail.text, /\/games\/naga/);

  // In the app, the notification links to My games (the game page is gone).
  const [n] = listNotifications(quiet);
  assert.equal(describeNotification(n, makeT("en")).href, "/dashboard");
});

test("people who turned notification emails off still don't get the everyday ones", async () => {
  const gm = user("gm2@x.test");
  const quiet = user("quiet2@x.test", 0);
  const id = Number(db().prepare("INSERT INTO notifications (user_id, kind, actor_id) VALUES (?, 'booking_new', ?)").run(quiet, gm).lastInsertRowid);
  db().prepare("INSERT INTO email_queue (notification_id) VALUES (?)").run(id);
  const before = sent.length;
  assert.equal(await deliverNotificationEmails("https://qb.test"), 0);
  assert.equal(sent.length, before);
});
