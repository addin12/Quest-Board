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
  | "session_reminder_1h";  // → booked players + GM: the session starts within the hour

/** Kinds that update one unread row instead of piling up (chatty events). */
const COLLAPSE: ReadonlySet<NotificationKind> = new Set(["request_message", "lfg_reply"]);

export type NotifyInput = {
  userId: number;
  kind: NotificationKind;
  actorId?: number | null;
  requestId?: number | null;
  sessionId?: number | null;
  reportId?: number | null;
  gameId?: number | null;
  postId?: number | null;
};

/** Record a notification. Never notifies people about their own actions. Pass `c` inside tx(). */
export function notify(n: NotifyInput, c: DatabaseSync = db()): void {
  if (n.actorId != null && n.actorId === n.userId) return;
  const now = new Date().toISOString();
  if (COLLAPSE.has(n.kind)) {
    const bumped = c
      .prepare(
        `UPDATE notifications SET created_at = ?, actor_id = ?
          WHERE user_id = ? AND kind = ? AND request_id IS ? AND post_id IS ? AND read_at IS NULL`,
      )
      .run(now, n.actorId ?? null, n.userId, n.kind, n.requestId ?? null, n.postId ?? null);
    if (Number(bumped.changes) > 0) return;
  }
  c.prepare("INSERT INTO notifications (user_id, kind, actor_id, request_id, session_id, report_id, game_id, post_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    n.userId, n.kind, n.actorId ?? null, n.requestId ?? null, n.sessionId ?? null, n.reportId ?? null, n.gameId ?? null, n.postId ?? null, now,
  );
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
  post_id: number | null;
  post_title: string | null;
};

export function listNotifications(userId: number, limit = 50): NotificationRow[] {
  return db()
    .prepare(
      `SELECT n.id, n.kind, n.created_at, n.read_at,
              a.name AS actor_name, a.avatar_hue AS actor_hue, a.avatar_image AS actor_image,
              n.request_id, r.title AS request_title,
              g.title AS game_title, g.slug AS game_slug, s.starts_at, n.post_id, lp.title AS post_title
         FROM notifications n
         LEFT JOIN users a ON a.id = n.actor_id
         LEFT JOIN gm_requests r ON r.id = n.request_id
         LEFT JOIN game_sessions s ON s.id = n.session_id
         LEFT JOIN games g ON g.id = COALESCE(n.game_id, s.game_id)
         LEFT JOIN lfg_posts lp ON lp.id = n.post_id
        WHERE n.user_id = ?
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ?`,
    )
    .all(userId, limit) as NotificationRow[];
}

export function countUnread(userId: number): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL").get(userId) as { n: number }).n;
}

export function markAllRead(userId: number): void {
  db().prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(new Date().toISOString(), userId);
}

/** Opening a request page reads its notifications. */
export function markRequestRead(userId: number, requestId: number): void {
  db()
    .prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND request_id = ? AND read_at IS NULL")
    .run(new Date().toISOString(), userId, requestId);
}
