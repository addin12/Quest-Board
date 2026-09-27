import "server-only";
import { db, tx } from "./db";
import { notify } from "./notifications";

// "How was {game}? Leave a review": a few hours after a player's session ends, once per player per
// game, only if they haven't reviewed it. Run from the cron route (and the browsing fallback).

const AFTER_MS = 3 * 3_600_000;       // wait until 3 hours after the session ended
const WINDOW_MS = 7 * 86_400_000;     // …and only for sessions that ended in the last week

export function promptReviews(now = new Date()): number {
  const endedBefore = now.getTime() - AFTER_MS;
  const endedAfter = now.getTime() - WINDOW_MS;
  const rows = db()
    .prepare(
      `SELECT DISTINCT s.game_id, b.player_id, s.id AS session_id, s.starts_at, s.duration_minutes
         FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id JOIN users u ON u.id = b.player_id
        WHERE b.status = 'confirmed' AND s.status <> 'cancelled' AND g.status <> 'archived'
          AND u.deleted_at IS NULL AND u.suspended_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.game_id = s.game_id AND r.player_id = b.player_id)
          AND NOT EXISTS (SELECT 1 FROM review_prompts p WHERE p.game_id = s.game_id AND p.player_id = b.player_id)
          AND s.starts_at >= ? AND s.starts_at <= ?`,
    )
    .all(new Date(endedAfter - 24 * 3_600_000).toISOString(), now.toISOString()) as { game_id: number; player_id: number; session_id: number; starts_at: string; duration_minutes: number }[];
  let n = 0;
  tx((c) => {
    for (const r of rows) {
      const ended = new Date(r.starts_at).getTime() + r.duration_minutes * 60_000;
      if (ended > endedBefore || ended < endedAfter) continue;
      if (Number(c.prepare("INSERT OR IGNORE INTO review_prompts (game_id, player_id) VALUES (?, ?)").run(r.game_id, r.player_id).changes) === 0) continue;
      notify({ userId: r.player_id, kind: "review_prompt", sessionId: r.session_id }, c);
      n++;
    }
  });
  return n;
}
