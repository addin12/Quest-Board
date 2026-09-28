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

test("removing reported content tells its author (without naming the moderator) and is logged", async () => {
  const { decideReport, listAdminLog } = await import("../../src/lib/moderation.ts");
  const { listNotifications } = await import("../../src/lib/notifications.ts");
  const { describeNotification } = await import("../../src/lib/notification-view.ts");
  const { makeT } = await import("../../src/lib/i18n/dict.ts");
  const author = user("rude@x.test");
  const reporter = user("reporter@x.test");
  const admin = user("mod@x.test");
  const gm = user("gm3@x.test");
  const game = Number(db().prepare(
    "INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, price_idr, seats_total, status) VALUES (?, 'g3', 'Game 3', 'D&D 5e (2014)', 's', 'd', 'one_shot', 'online', 'id', 0, 5, 'published')",
  ).run(gm).lastInsertRowid);
  const review = Number(db().prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, 1, 'rude words')").run(game, author).lastInsertRowid);
  const report = Number(db().prepare(
    "INSERT INTO reports (reporter_id, target_type, target_id, target_owner_id, reason, snapshot, href) VALUES (?, 'review', ?, ?, 'harassment', 'rude words', '/games/g3')",
  ).run(reporter, review, author).lastInsertRowid);

  assert.equal(decideReport(report, admin, "remove", "insults the GM"), true);
  assert.equal(db().prepare("SELECT 1 FROM reviews WHERE id = ?").get(review), undefined);
  const [n] = listNotifications(author);
  const view = describeNotification(n, makeT("en"));
  assert.equal(view.text, "A moderator removed your review because it broke the community guidelines");
  assert.equal(view.href, "/terms#s6");
  assert.equal(view.actor, null); // the moderator isn't named
  assert.deepEqual(kinds(reporter), ["report_resolved"]);
  const [entry] = listAdminLog(1);
  assert.equal(entry.action, "report_remove");
  assert.equal(entry.admin_name, "mod");
  assert.equal(entry.target_name, "rude");
  assert.match(entry.detail, /^review #\d+ — insults the GM$/);
});

test("a GM's reply to a review can be reported; removing it clears only the reply and tells the GM", async () => {
  const { createReport, decideReport } = await import("../../src/lib/moderation.ts");
  const { listNotifications } = await import("../../src/lib/notifications.ts");
  const { describeNotification } = await import("../../src/lib/notification-view.ts");
  const { makeT } = await import("../../src/lib/i18n/dict.ts");
  const gm = user("gm4@x.test");
  const player = user("reviewer4@x.test");
  const admin = user("mod4@x.test");
  const game = Number(db().prepare(
    "INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, price_idr, seats_total, status) VALUES (?, 'g4', 'Game 4', 'D&D 5e (2014)', 's', 'd', 'one_shot', 'online', 'id', 0, 5, 'published')",
  ).run(gm).lastInsertRowid);
  const review = Number(db().prepare("INSERT INTO reviews (game_id, player_id, rating, body, gm_reply) VALUES (?, ?, 2, 'meh', 'You were rude at my table')").run(game, player).lastInsertRowid);

  assert.equal(createReport(gm, "review_reply", review, "harassment", ""), "own"); // the GM can't report their own reply
  assert.equal(createReport(player, "review_reply", review, "harassment", ""), "ok");
  const report = (db().prepare("SELECT id, target_owner_id, snapshot FROM reports WHERE target_type = 'review_reply' AND target_id = ?").get(review)) as { id: number; target_owner_id: number; snapshot: string };
  assert.equal(report.target_owner_id, gm);
  assert.match(report.snapshot, /You were rude at my table/);

  assert.equal(decideReport(report.id, admin, "remove", ""), true);
  const after = db().prepare("SELECT body, gm_reply FROM reviews WHERE id = ?").get(review) as { body: string; gm_reply: string };
  assert.deepEqual({ ...after }, { body: "meh", gm_reply: "" }); // the review itself stays
  const n = listNotifications(gm).find((x) => x.kind === "content_removed");
  assert.ok(n);
  assert.equal(describeNotification(n, makeT("en")).text, "A moderator removed your reply to a review because it broke the community guidelines");
});

test("a notice's author is reminded once, 3 days before it comes down; keeping it up starts over", async () => {
  const { remindExpiringNotices, renewNotice, getNotice } = await import("../../src/lib/community.ts");
  const author = user("pinner@x.test");
  const post = createNotice(author, { kind: "lf_group", title: "Looking for a Friday group", system: "", locationType: "online", city: "", language: "id", schedule: "Fridays", spots: 0, body: "New to TTRPGs, would love a friendly online group on Fridays." });
  db().prepare("UPDATE lfg_posts SET status = 'closed' WHERE id <> ?").run(post); // notices from earlier tests would come due too
  const day = 86_400_000;
  const created = Date.parse(getNotice(post)!.expires_at) - 30 * day;
  assert.equal(remindExpiringNotices(new Date(created + 20 * day)), 0); // 10 days left: too early
  assert.equal(remindExpiringNotices(new Date(created + 27.5 * day)), 1); // 2.5 days left
  assert.equal(remindExpiringNotices(new Date(created + 28 * day)), 0); // only once
  assert.deepEqual(kinds(author), ["notice_expiring"]);

  renewNotice(post, new Date(created + 28 * day));
  const renewed = getNotice(post)!;
  assert.equal(Date.parse(renewed.expires_at), created + 58 * day); // 30 days from when it was kept up
  assert.equal(remindExpiringNotices(new Date(created + 56 * day)), 1); // reminded again next time round
});

test("a moderator removes a notice directly: gone, the author is told, logged, and open reports about it resolved", async () => {
  const { removeDirectly, createReport, listAdminLog } = await import("../../src/lib/moderation.ts");
  const author = user("spammer@x.test");
  const reporter = user("watchful@x.test");
  const admin = user("mod5@x.test");
  const post = createNotice(author, { kind: "lf_group", title: "Buy cheap dice here", system: "", locationType: "online", city: "", language: "id", schedule: "Always", spots: 0, body: "Visit my shop for the cheapest dice anywhere, click now!" });
  assert.equal(createReport(reporter, "lfg_post", post, "spam", ""), "ok"); // someone reported it earlier

  assert.equal(removeDirectly(admin, "user", author, ""), false); // people are suspended, not removed
  assert.equal(removeDirectly(admin, "lfg_post", post, ""), true);
  assert.equal(db().prepare("SELECT 1 FROM lfg_posts WHERE id = ?").get(post), undefined);
  assert.ok(kinds(author).includes("content_removed"));
  assert.ok(kinds(reporter).includes("report_resolved")); // the earlier report is closed too
  assert.equal(db().prepare("SELECT COUNT(*) AS n FROM reports WHERE target_type = 'lfg_post' AND target_id = ? AND status = 'open'").get(post)?.n, 0);
  assert.equal(listAdminLog(1)[0].action, "report_remove");
  assert.equal(removeDirectly(admin, "lfg_post", post, ""), false); // already gone
});
