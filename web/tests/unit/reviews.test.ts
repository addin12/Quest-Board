// Who may review, and when — against a temporary database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-reviews-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");
const { canReview } = await import("../../src/lib/queries.ts");

const H = 3_600_000;
const user = (email: string) => Number(db().prepare("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', ?)").run(email, email).lastInsertRowid);
const gm = user("gm@x.test");
let n = 0;
const gameWithSession = (startedHoursAgo: number, status = "scheduled", booking = "confirmed") => {
  const g = Number(db().prepare(
    "INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, language, price_idr, seats_total, status) VALUES (?, ?, 'G', 'D&D 5e (2014)', 's', 'd', 'one_shot', 'online', 'id', 0, 5, 'published')",
  ).run(gm, `g${++n}`).lastInsertRowid);
  const s = Number(db().prepare("INSERT INTO game_sessions (game_id, starts_at, duration_minutes, status) VALUES (?, ?, 180, ?)").run(g, new Date(Date.now() - startedHoursAgo * H).toISOString(), status).lastInsertRowid);
  const p = user(`p${n}@x.test`);
  db().prepare("INSERT INTO bookings (session_id, player_id, price_idr, status) VALUES (?, ?, 0, ?)").run(s, p, booking);
  return { g, p };
};

test("a review opens when the session has ended, not when it starts", () => {
  const during = gameWithSession(1); // 1 h into a 3 h session
  assert.equal(canReview(during.g, during.p), false);
  const after = gameWithSession(4);
  assert.equal(canReview(after.g, after.p), true);
  const markedPlayed = gameWithSession(1, "completed"); // the GM wrapped up early
  assert.equal(canReview(markedPlayed.g, markedPlayed.p), true);
});

test("no review for a cancelled seat, a future session, or a second time", () => {
  const cancelledSeat = gameWithSession(5, "scheduled", "cancelled");
  assert.equal(canReview(cancelledSeat.g, cancelledSeat.p), false);
  const future = gameWithSession(-24);
  assert.equal(canReview(future.g, future.p), false);
  const done = gameWithSession(5);
  db().prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, 5, 'great')").run(done.g, done.p);
  assert.equal(canReview(done.g, done.p), false);
});
