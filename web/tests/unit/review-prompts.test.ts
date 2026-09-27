// "Leave a review" prompts against a temporary database (server modules load via tests/loader.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-prompts-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");
const { promptReviews } = await import("../../src/lib/review-prompts.ts");

const H = 3_600_000;
const now = new Date("2026-10-10T12:00:00Z");
const user = (email: string) => Number(db().prepare("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', ?)").run(email, email).lastInsertRowid);
const gm = user("gm@x.test");
const game = (slug: string) => Number(db().prepare(
  "INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, price_idr, seats_total, status) VALUES (?, ?, ?, 'D&D 5e (2014)', 's', 'd', 'one_shot', 'online', 'id', 0, 5, 'published')",
).run(gm, slug, slug).lastInsertRowid);
const session = (g: number, endedHoursAgo: number, status = "scheduled") => Number(db().prepare(
  "INSERT INTO game_sessions (game_id, starts_at, duration_minutes, status) VALUES (?, ?, 180, ?)",
).run(g, new Date(now.getTime() - endedHoursAgo * H - 3 * H).toISOString(), status).lastInsertRowid);
const book = (s: number, p: number) => db().prepare("INSERT INTO bookings (session_id, player_id, price_idr) VALUES (?, ?, 0)").run(s, p);
const prompts = (p: number) => (db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'review_prompt'").get(p) as { n: number }).n;

test("a player is asked once per game, a few hours after the session ends", () => {
  const p = user("p1@x.test");
  const g = game("naga");
  book(session(g, 4), p);
  assert.equal(promptReviews(now), 1);
  assert.equal(prompts(p), 1);
  // Queued for email too (review_prompt is an email kind).
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM email_queue q JOIN notifications n ON n.id = q.notification_id WHERE n.user_id = ?").get(p) as { n: number }).n, 1);
  book(session(g, 5), p); // another session of the same game
  assert.equal(promptReviews(now), 0);
  assert.equal(prompts(p), 1);
});

test("not too early, not too late, not for cancelled sessions, not after a review", () => {
  const early = user("early@x.test"); book(session(game("early"), 1), early);     // ended 1 h ago
  const late = user("late@x.test"); book(session(game("late"), 24 * 9), late);   // ended 9 days ago
  const off = user("off@x.test"); book(session(game("off"), 4, "cancelled"), off);
  const done = user("done@x.test"); const g = game("reviewed"); book(session(g, 4), done);
  db().prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, 5, 'great')").run(g, done);
  assert.equal(promptReviews(now), 0);
  for (const p of [early, late, off, done]) assert.equal(prompts(p), 0);
});
