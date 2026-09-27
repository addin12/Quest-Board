import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { db } from "./db";

// In-app notifications (schema v8). Rows are written by server actions right
// after the event; the header bell shows the unread count and /notifications
// lists them. Session reminders are also emailed (lib/reminders.ts).

export type NotificationKind =
  | "request_direct"     // → GM: a player sent them a direct request
  | "offer_received"     // → requester: a GM sent an offer
  | "offer_chosen"       // → GM: the requester chose their offer
  | "request_message"    // → the other party in a matched request's thread (collapsed while unread)
  | "booking_new"        // → GM: a player reserved a seat
  | "booking_cancelled"  // → GM: a player cancelled their seat
  | "session_cancelled"  // → player: the GM cancelled a session they had booked
  | "report_new"         // → admins: a member reported something
  | "report_resolved"    // → reporter: a moderator reviewed their report
  | "waitlist_offer"     // → player: a seat opened up and is held for them
  | "payment_confirmed"  // → player: the GM marked their seat as paid
  | "lfg_reply"          // → notice author: someone replied on the Notice Board (collapsed while unread)
  | "followed_gm_game"   // → follower: a GM they follow published a new game
  | "session_reminder_24h" // → booked players + GM: the session is within 24 hours (lib/reminders.ts)
  | "session_reminder_1h"   // → booked players + GM: the session starts within the hour
  | "game_question"        // → GM or player: a message in a pre-booking question thread (collapsed while unread)
  | "feedback_new"         // → admins: someone sent feedback
  | "review_prompt";       // → player: a few hours after their session, "leave a review" (once per game)

/**
 * Kinds that are also emailed (see lib/notification-mail.ts). Not here: session_cancelled
 * (the cancel action sends its own email with the GM's message), reminders (their own emails),
 * and low-urgency kinds (follows, paid ticks, board replies, report outcomes).
 */
export const EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set([
  "booking_new", "booking_cancelled", "waitlist_offer", "request_direct", "offer_received", "offer_chosen",
  "request_message", "game_question", "feedback_new", "review_prompt",
]);

/** Kinds that update one unread row instead of piling up (chatty events). */
const COLLAPSE: ReadonlySet<NotificationKind> = new Set(["request_message", "lfg_reply", "game_question"]);

export type NotifyInput = {
  userId: number;
  kind: NotificationKind;
  actorId?: number | null;
  requestId?: number | null;
  sessionId?: number | null;
  reportId?: number | null;
  gameId?: number | null;
  postId?: number | null;
  questionId?: number | null;
};

/** Record a notification. Never notifies people about their own actions. Pass `c` inside tx(). */
export function notify(n: NotifyInput, c: DatabaseSync = db()): void {
  if (n.actorId != null && n.actorId === n.userId) return;
  const now = new Date().toISOString();
  if (COLLAPSE.has(n.kind)) {
    const bumped = c
      .prepare(
        `UPDATE notifications SET created_at = ?, actor_id = ?
          WHERE user_id = ? AND kind = ? AND request_id IS ? AND post_id IS ? AND question_id IS ? AND read_at IS NULL`,
      )
      .run(now, n.actorId ?? null, n.userId, n.kind, n.requestId ?? null, n.postId ?? null, n.questionId ?? null);
    if (Number(bumped.changes) > 0) return;
  }
  const id = c.prepare("INSERT INTO notifications (user_id, kind, actor_id, request_id, session_id, report_id, game_id, post_id, question_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    n.userId, n.kind, n.actorId ?? null, n.requestId ?? null, n.sessionId ?? null, n.reportId ?? null, n.gameId ?? null, n.postId ?? null, n.questionId ?? null, now,
  ).lastInsertRowid;
  // Same transaction as the notification: if the change is rolled back, no email goes out.
  if (EMAIL_KINDS.has(n.kind)) c.prepare("INSERT INTO email_queue (notification_id) VALUES (?)").run(id);
}

export type NotificationRow = {
  id: number;
  kind: NotificationKind;
  created_at: string;
  read_at: string | null;
  actor_name: string | null;
  actor_hue: number | null;
  actor_image: string | null;
  request_id: number | null;
  request_title: string | null;
  game_title: string | null;
  game_slug: string | null;
  starts_at: string | null;
  cancel_reason: string | null;
  question_id: number | null;
  post_id: number | null;
  post_title: string | null;
};

const ROW_SELECT = `SELECT n.id, n.kind, n.created_at, n.read_at,
              a.name AS actor_name, a.avatar_hue AS actor_hue, a.avatar_image AS actor_image,
              n.request_id, r.title AS request_title,
              g.title AS game_title, g.slug AS game_slug, s.starts_at, s.cancel_reason, n.question_id, n.post_id, lp.title AS post_title
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
         LEFT JOIN gm_requests r ON r.id = n.request_id
         LEFT JOIN game_sessions s ON s.id = n.session_id
         LEFT JOIN game_questions gq ON gq.id = n.question_id
         LEFT JOIN games g ON g.id = COALESCE(n.game_id, s.game_id, gq.game_id)
         LEFT JOIN lfg_posts lp ON lp.id = n.post_id`;

export function listNotifications(userId: number, limit = 50): NotificationRow[] {
  return db()
    .prepare(`${ROW_SELECT} WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ?`)
    .all(userId, limit) as NotificationRow[];
}

/** One notification with everything needed to describe it (for its email). */
export function getNotificationRow(id: number): (NotificationRow & { user_id: number }) | undefined {
  return db().prepare(`${ROW_SELECT.replace("SELECT n.id,", "SELECT n.id, n.user_id,")} WHERE n.id = ?`).get(id) as (NotificationRow & { user_id: number }) | undefined;
}

/** Housekeeping (from the cron route): read notifications older than `days` are dropped. */
export function pruneNotifications(days = 180): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return Number(db().prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?").run(cutoff).changes);
}

export function countUnread(userId: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId) as { n: number }).n;
}

export function markAllRead(userId: number): void {
  db().prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(new Date().toISOString(), userId);
}

/** Opening a question thread reads its notifications. */
export function markQuestionRead(userId: number, questionId: number): void {
  db()
    .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND question_id = ? AND read_at IS NULL")
    .run(new Date().toISOString(), userId, questionId);
}

/** Opening a request page reads its notifications. */
export function markRequestRead(userId: number, requestId: number): void {
  db()
    .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND request_id = ? AND read_at IS NULL")
    .run(new Date().toISOString(), userId, requestId);
}
