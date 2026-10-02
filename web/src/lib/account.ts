import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { db, tx } from "./db";
import { notify } from "./notifications";
import { dropFromWaitlists, processWaitlist } from "./waitlist";
import { DELETED_NAME } from "./i18n/dict";
import { deleteUserUploads } from "./uploads";

/**
 * Archive a game: hide it, cancel its upcoming sessions and release (and notify) every
 * booked seat. Shared by the GM's "Archive" button and account deletion. Run inside tx().
 */
export function archiveGame(c: DatabaseSync, gameId: number, actorId: number): number {
  const now = new Date().toISOString();
  const seats = c
    .prepare(
      `SELECT b.id, b.player_id, b.session_id FROM bookings b JOIN game_sessions s ON s.id = b.session_id
        WHERE b.status = 'confirmed' AND s.game_id = ? AND s.status = 'scheduled' AND s.starts_at > ?`,
    )
    .all(gameId, now) as { id: number; player_id: number; session_id: number }[];
  for (const b of seats) notify({ userId: b.player_id, kind: "session_cancelled", actorId, sessionId: b.session_id }, c);
  c.prepare(
    `UPDATE bookings SET status = 'cancelled', cancelled_by = 'gm', cancelled_at = ?
      WHERE status = 'confirmed' AND session_id IN (
        SELECT id FROM game_sessions WHERE game_id = ? AND status = 'scheduled' AND starts_at > ?)`,
  ).run(now, gameId, now);
  c.prepare("UPDATE game_sessions SET status = 'cancelled' WHERE game_id = ? AND status = 'scheduled' AND starts_at > ?").run(gameId, now);
  c.prepare("UPDATE waitlist SET status = 'expired' WHERE status IN ('waiting','offered') AND session_id IN (SELECT id FROM game_sessions WHERE game_id = ?)").run(gameId);
  c.prepare("UPDATE games SET status = 'archived' WHERE id = ?").run(gameId);
  return seats.length;
}

/**
 * Delete an account (UU PDP right to erasure) without breaking other people's history:
 * - upcoming seats are released (GMs are notified); a GM's games are archived (players notified)
 * - open GM requests are closed and pending offers withdrawn
 * - personal data is scrubbed (email, name, bio, portrait, GM profile incl. payment details)
 * - reviews and chat messages stay, attributed to "Anonymous"
 * - every session, token and notification of the account is removed; it can never log in again
 */
export function deleteAccount(userId: number): void {
  const now = new Date().toISOString();
  tx((c) => {
    const future = c
      .prepare(
        `SELECT b.id, b.session_id, g.gm_id FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id
          WHERE b.player_id = ? AND b.status = 'confirmed' AND s.status = 'scheduled' AND s.starts_at > ?`,
      )
      .all(userId, now) as { id: number; session_id: number; gm_id: number }[];
    for (const b of future) notify({ userId: b.gm_id, kind: "booking_cancelled", actorId: userId, sessionId: b.session_id }, c);
    c.prepare(
      `UPDATE bookings SET status = 'cancelled', cancelled_by = 'player', cancelled_at = ?
        WHERE player_id = ? AND status = 'confirmed' AND session_id IN (SELECT id FROM game_sessions WHERE status = 'scheduled' AND starts_at > ?)`,
    ).run(now, userId, now);

    for (const b of future) processWaitlist(c, b.session_id); // their released seats go to the waitlist
    dropFromWaitlists(c, userId);
    const games = c.prepare("SELECT id FROM games WHERE gm_id = ? AND status <> 'archived'").all(userId) as { id: number }[];
    for (const g of games) archiveGame(c, g.id, userId);

    c.prepare("UPDATE gm_requests SET status = 'closed' WHERE requester_id = ? AND status = 'open'").run(userId);
    c.prepare("UPDATE lfg_posts SET status = 'closed' WHERE author_id = ? AND status = 'open'").run(userId);
    c.prepare("DELETE FROM saved_games WHERE user_id = ?").run(userId);
    c.prepare("DELETE FROM gm_follows WHERE follower_id = ? OR gm_id = ?").run(userId, userId);
    c.prepare("DELETE FROM gm_request_offers WHERE gm_id = ? AND request_id IN (SELECT id FROM gm_requests WHERE status = 'open')").run(userId);

    c.prepare("DELETE FROM email_suppressions WHERE email = (SELECT email FROM users WHERE id = ?)").run(userId); // before the address is scrubbed
    c.prepare(
      `UPDATE users SET email = ?, name = ?, bio = '', avatar_image = '', password_hash = '!', email_verified_at = NULL, deleted_at = ?, calendar_token = NULL,
                        role = CASE WHEN role = 'admin' THEN 'player' ELSE role END
        WHERE id = ?`,
    ).run(`deleted-${userId}@deleted.invalid`, DELETED_NAME, now, userId);
    c.prepare("UPDATE gm_profiles SET headline = '', systems = '', location = '', payment_info = '', refund_terms = '', payment_qr = '', verified = 0 WHERE user_id = ?").run(userId);
    c.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
    c.prepare("DELETE FROM auth_tokens WHERE user_id = ?").run(userId);
    c.prepare("DELETE FROM email_changes WHERE user_id = ?").run(userId);
    c.prepare("DELETE FROM notifications WHERE user_id = ?").run(userId);
  });
  deleteUserUploads(userId); // their uploaded pictures (files and records)
}

/** Everything Quest Board holds about a person (UU PDP right of access), as plain JSON. */
export function exportAccount(userId: number) {
  const q = (sql: string, ...args: (string | number)[]) => db().prepare(sql).all(...args);
  const one = (sql: string, ...args: (string | number)[]) => db().prepare(sql).get(...args);
  return {
    feedback: q("SELECT kind, body, page, created_at FROM feedback WHERE user_id = ? ORDER BY created_at", userId),
    payment_detail_changes: q("SELECT changed_at FROM payment_changes WHERE user_id = ? ORDER BY changed_at", userId),
    login_devices: q("SELECT device, first_seen_at, last_seen_at FROM login_devices WHERE user_id = ? ORDER BY first_seen_at", userId),
    email_delivery_stopped: one("SELECT reason, created_at FROM email_suppressions WHERE email = (SELECT email FROM users WHERE id = ?)", userId) ?? null,
    questions: q(
      `SELECT g.title AS game, m.body, m.created_at FROM game_question_messages m JOIN game_questions gq ON gq.id = m.question_id
         JOIN games g ON g.id = gq.game_id WHERE m.user_id = ? ORDER BY m.created_at`, userId),
    exported_at: new Date().toISOString(),
    account: one("SELECT id, email, name, role, bio, avatar_image, email_verified_at, locale, email_reminders, email_notifications, time_zone, terms_accepted_at, terms_version, created_at FROM users WHERE id = ?", userId),
    gm_profile: one("SELECT headline, systems, years_experience, location, verified, payment_info, refund_terms, payment_qr FROM gm_profiles WHERE user_id = ?", userId) ?? null,
    bookings: q(
      `SELECT b.id, g.title AS game, s.starts_at, b.status, b.cancelled_by, b.price_idr, b.created_at
         FROM bookings b JOIN game_sessions s ON s.id = b.session_id JOIN games g ON g.id = s.game_id WHERE b.player_id = ? ORDER BY s.starts_at`,
      userId,
    ),
    reviews: q("SELECT r.id, g.title AS game, r.rating, r.body, r.created_at FROM reviews r JOIN games g ON g.id = r.game_id WHERE r.player_id = ?", userId),
    uploads: q("SELECT kind, '/uploads/' || file AS path, created_at FROM uploads WHERE user_id = ? ORDER BY created_at", userId),
    review_replies: q("SELECT g.title AS game, r.gm_reply AS reply, r.gm_replied_at AS replied_at FROM reviews r JOIN games g ON g.id = r.game_id WHERE g.gm_id = ? AND r.gm_reply <> ''", userId),
    table_messages: q("SELECT m.id, g.title AS game, m.body, m.created_at FROM messages m JOIN games g ON g.id = m.game_id WHERE m.user_id = ?", userId),
    games_run: q("SELECT id, title, system, status, price_idr, created_at FROM games WHERE gm_id = ?", userId),
    gm_requests: q("SELECT id, title, system, group_size, status, created_at FROM gm_requests WHERE requester_id = ?", userId),
    offers_sent: q("SELECT o.id, r.title AS request, o.message, o.price_idr, o.created_at FROM gm_request_offers o JOIN gm_requests r ON r.id = o.request_id WHERE o.gm_id = ?", userId),
    request_messages: q("SELECT id, request_id, body, created_at FROM gm_request_messages WHERE user_id = ?", userId),
    notifications: q("SELECT kind, created_at, read_at FROM notifications WHERE user_id = ?", userId),
    notice_board_posts: q("SELECT id, kind, title, system, schedule, body, status, created_at FROM lfg_posts WHERE author_id = ?", userId),
    notice_board_replies: q("SELECT id, post_id, body, created_at FROM lfg_replies WHERE author_id = ?", userId),
    saved_games: q("SELECT g.title, s.created_at FROM saved_games s JOIN games g ON g.id = s.game_id WHERE s.user_id = ?", userId),
    following: q("SELECT u.name, f.created_at FROM gm_follows f JOIN users u ON u.id = f.gm_id WHERE f.follower_id = ?", userId),
    waitlist: q(
      `SELECT g.title AS game, s.starts_at, w.status, w.offered_at, w.expires_at, w.created_at
         FROM waitlist w JOIN game_sessions s ON s.id = w.session_id JOIN games g ON g.id = s.game_id WHERE w.player_id = ? ORDER BY w.created_at`, userId),
    reports_filed: q("SELECT target_type, reason, details, status, created_at FROM reports WHERE reporter_id = ? ORDER BY created_at", userId),
  };
}
