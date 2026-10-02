// The 24-hour reminder for an online game carries the table's link (games.table_link), and is optional
// mail (it may wait for room under the daily limit, but never past the start).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

process.env.QUESTBOARD_DB = join(mkdtempSync(join(tmpdir(), "qb-remind-")), "test.db");
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");
const { processReminders } = await import("../../src/lib/reminders.ts");

test("an online game's reminder email has the link to join; one without a link says so", async () => {
  const c = db();
  const user = (email: string, role: string) => Number(c.prepare("INSERT INTO users (email, password_hash, name, role, email_verified_at) VALUES (?, '!', ?, ?, ?)").run(email, email.split("@")[0], role, new Date().toISOString()).lastInsertRowid);
  const gm = user("gm@x.test", "gm"), player = user("player@x.test", "player");
  const game = (slug: string, link: string) => Number(c.prepare(
    `INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, platform, table_link, price_idr, seats_total, status)
     VALUES (?, ?, ?, 'Mothership', 'A short horror one-shot.', 'A long enough description for a game.', 'one_shot', 'online', 'Discord', ?, 0, 4, 'published')`,
  ).run(gm, slug, slug, link).lastInsertRowid);
  const now = new Date("2026-10-10T00:00:00Z");
  const book = (gameId: number) => {
    const s = Number(c.prepare("INSERT INTO game_sessions (game_id, starts_at, duration_minutes) VALUES (?, ?, 180)").run(gameId, new Date(now.getTime() + 23 * 3_600_000).toISOString()).lastInsertRowid);
    c.prepare("INSERT INTO bookings (session_id, player_id, status, price_idr, created_at) VALUES (?, ?, 'confirmed', 0, ?)").run(s, player, new Date(now.getTime() - 3 * 86_400_000).toISOString());
  };
  book(game("with-link", "https://discord.gg/with-link"));
  book(game("no-link", ""));

  await processReminders("https://qb.test", now);
  const mails = c.prepare("SELECT subject, body_text, optional, expires_at FROM email_outbox WHERE to_address = 'player@x.test' ORDER BY id").all() as { subject: string; body_text: string; optional: number; expires_at: string }[];
  assert.equal(mails.length, 2);
  const withLink = mails.find((m) => m.subject.includes("with-link"))!;
  assert.match(withLink.body_text, /Online — join here: https:\/\/discord\.gg\/with-link/);
  assert.equal(withLink.optional, 1);
  assert.ok(withLink.expires_at); // never sent after the session starts
  assert.match(mails.find((m) => m.subject.includes("no-link"))!.body_text, /Online — the link is in the table chat/);
});
