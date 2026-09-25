import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { db, tx } from "./db";
import { notify } from "./notifications";

// Waitlist for full sessions. When a seat frees up, the first person waiting is offered it
// and has OFFER_HOURS to claim it (or until the session starts, if sooner). An outstanding
// offer holds the seat: it counts as taken for everyone else. Offers are processed lazily
// (when the session is viewed, booked or changed) — no background job needed.

export const OFFER_HOURS = 12;

export type WaitStatus = "waiting" | "offered" | "claimed" | "expired" | "left";

/** Seats held by live offers, optionally not counting one person's own offer. */
export function heldSeats(c: DatabaseSync, sessionId: number, exceptUserId?: number): number {
  return (
    c.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE session_id = ? AND status = 'offered' AND expires_at > ? AND player_id <> ?")
      .get(sessionId, new Date().toISOString(), exceptUserId ?? -1) as { n: number }
  ).n;
}

/** Expire stale offers, then offer every free seat to the next people in line. Run inside tx(). */
export function processWaitlist(c: DatabaseSync, sessionId: number): void {
  const now = new Date();
  const nowIso = now.toISOString();
  c.prepare("UPDATE waitlist SET status = 'expired' WHERE session_id = ? AND status = 'offered' AND expires_at <= ?").run(sessionId, nowIso);
  const s = c
    .prepare(
      `SELECT s.starts_at, s.status, g.seats_total, g.status AS game_status, g.gm_id,
              (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') AS taken
         FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE s.id = ?`,
    )
    .get(sessionId) as { starts_at: string; status: string; seats_total: number; game_status: string; gm_id: number; taken: number } | undefined;
  if (!s) return;
  if (s.status !== "scheduled" || s.game_status !== "published" || new Date(s.starts_at) <= now) {
    c.prepare("UPDATE waitlist SET status = 'expired' WHERE session_id = ? AND status IN ('waiting','offered')").run(sessionId);
    return;
  }
  let free = s.seats_total - s.taken - heldSeats(c, sessionId);
  if (free <= 0) return;
  const expires = new Date(Math.min(now.getTime() + OFFER_HOURS * 3_600_000, new Date(s.starts_at).getTime())).toISOString();
  const next = c
    .prepare("SELECT id, player_id FROM waitlist WHERE session_id = ? AND status = 'waiting' ORDER BY created_at, id LIMIT ?")
    .all(sessionId, free) as { id: number; player_id: number }[];
  for (const w of next) {
    c.prepare("UPDATE waitlist SET status = 'offered', offered_at = ?, expires_at = ? WHERE id = ?").run(nowIso, expires, w.id);
    notify({ userId: w.player_id, kind: "waitlist_offer", actorId: s.gm_id, sessionId }, c);
    free--;
  }
}

/** Remove someone from every waitlist (account deleted or suspended); seats they held pass on. Run inside tx(). */
export function dropFromWaitlists(c: DatabaseSync, userId: number): void {
  const rows = c.prepare("SELECT session_id FROM waitlist WHERE player_id = ? AND status IN ('waiting','offered')").all(userId) as { session_id: number }[];
  c.prepare("UPDATE waitlist SET status = 'left' WHERE player_id = ? AND status IN ('waiting','offered')").run(userId);
  for (const r of rows) processWaitlist(c, r.session_id);
}

/** Convenience wrapper for pages: bring a set of sessions up to date. */
export function refreshWaitlists(sessionIds: number[]): void {
  if (sessionIds.length === 0) return;
  tx((c) => {
    for (const id of sessionIds) processWaitlist(c, id);
  });
}

export type JoinResult = "ok" | "notFull" | "already" | "booked" | "notAllowed";

export function joinWaitlist(sessionId: number, userId: number): JoinResult {
  return tx((c): JoinResult => {
    processWaitlist(c, sessionId);
    const s = c
      .prepare(
        `SELECT s.status, s.starts_at, g.seats_total, g.status AS game_status, g.gm_id,
                (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') AS taken
           FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE s.id = ?`,
      )
      .get(sessionId) as { status: string; starts_at: string; seats_total: number; game_status: string; gm_id: number; taken: number } | undefined;
    if (!s || s.status !== "scheduled" || s.game_status !== "published" || new Date(s.starts_at) <= new Date() || s.gm_id === userId) return "notAllowed";
    if (c.prepare("SELECT 1 FROM bookings WHERE session_id = ? AND player_id = ? AND status = 'confirmed'").get(sessionId, userId)) return "booked";
    const existing = c.prepare("SELECT status FROM waitlist WHERE session_id = ? AND player_id = ?").get(sessionId, userId) as { status: WaitStatus } | undefined;
    if (existing && (existing.status === "waiting" || existing.status === "offered")) return "already";
    if (s.taken + heldSeats(c, sessionId) < s.seats_total) return "notFull";
    const now = new Date().toISOString();
    if (existing) {
      // Re-joining goes to the back of the line.
      c.prepare("UPDATE waitlist SET status = 'waiting', created_at = ?, offered_at = NULL, expires_at = NULL WHERE session_id = ? AND player_id = ?").run(now, sessionId, userId);
    } else {
      c.prepare("INSERT INTO waitlist (session_id, player_id, created_at) VALUES (?, ?, ?)").run(sessionId, userId, now);
    }
    return "ok";
  });
}

export function leaveWaitlist(sessionId: number, userId: number): void {
  tx((c) => {
    c.prepare("UPDATE waitlist SET status = 'left' WHERE session_id = ? AND player_id = ? AND status IN ('waiting','offered')").run(sessionId, userId);
    processWaitlist(c, sessionId); // a declined offer passes to the next person
  });
}

export type MyWait = { session_id: number; status: "waiting" | "offered"; expires_at: string | null; position: number };

/** This person's live waitlist entries (optionally for one game), with their place in line. */
export function myWaitlist(userId: number, gameId?: number): MyWait[] {
  return db()
    .prepare(
      `SELECT w.session_id, w.status, w.expires_at,
              (SELECT COUNT(*) FROM waitlist x WHERE x.session_id = w.session_id AND x.status = 'waiting'
                 AND (x.created_at < w.created_at OR (x.created_at = w.created_at AND x.id <= w.id))) AS position
         FROM waitlist w JOIN game_sessions s ON s.id = w.session_id
        WHERE w.player_id = ? AND w.status IN ('waiting','offered') AND s.starts_at > ? ${gameId ? "AND s.game_id = ?" : ""}
        ORDER BY s.starts_at`,
    )
    .all(...([userId, new Date().toISOString(), ...(gameId ? [gameId] : [])] as (string | number)[])) as MyWait[];
}

export type WaitlistEntry = MyWait & { title: string; slug: string; starts_at: string; system: string };

export function myWaitlistDetailed(userId: number): WaitlistEntry[] {
  return db()
    .prepare(
      `SELECT w.session_id, w.status, w.expires_at, s.starts_at, g.title, g.slug, g.system,
              (SELECT COUNT(*) FROM waitlist x WHERE x.session_id = w.session_id AND x.status = 'waiting'
                 AND (x.created_at < w.created_at OR (x.created_at = w.created_at AND x.id <= w.id))) AS position
         FROM waitlist w JOIN game_sessions s ON s.id = w.session_id JOIN games g ON g.id = s.game_id
        WHERE w.player_id = ? AND w.status IN ('waiting','offered') AND s.starts_at > ?
        ORDER BY s.starts_at`,
    )
    .all(userId, new Date().toISOString()) as WaitlistEntry[];
}

/** How many people wait for each session of a game (for the GM roster). */
export function waitingCounts(gameId: number): Map<number, number> {
  const rows = db()
    .prepare(
      `SELECT w.session_id, COUNT(*) AS n FROM waitlist w JOIN game_sessions s ON s.id = w.session_id
        WHERE s.game_id = ? AND w.status IN ('waiting','offered') GROUP BY w.session_id`,
    )
    .all(gameId) as { session_id: number; n: number }[];
  return new Map(rows.map((r) => [r.session_id, r.n]));
}
