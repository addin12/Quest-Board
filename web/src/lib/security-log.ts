import "server-only";
import { db } from "./db";

// The security log (schema v41 security_events): what an investigation after an account takeover needs —
// failed logins, wrong two-step codes, password, email and two-step changes, "log out everywhere", and a
// signed-in person refused the admin console. Append-only: the database refuses to change a row, or to
// delete one before it's 180 days old (pruneSecurityEvents removes them then). Never a password, code
// or token in `detail`. Admins read it on the Errors page.

export type SecurityEventKind =
  | "login_failed"       // detail: "wrong password" | "unknown account"
  | "two_step_failed"    // a wrong code at login; detail "locked" when the step was locked out
  | "password_changed"
  | "password_reset"     // through the emailed link
  | "email_changed"      // detail: the old address's domain only
  | "two_step_on"
  | "two_step_off"
  | "logout_everywhere"
  | "admin_denied";      // an admin account without two-step was sent to set it up

export const SECURITY_KEEP_DAYS = 180;

/** Record a security event. Never throws: logging must not break the login or the change it records. */
export function logSecurityEvent(kind: SecurityEventKind, userId: number | null, detail = ""): void {
  try {
    db().prepare("INSERT INTO security_events (kind, user_id, detail) VALUES (?, ?, ?)").run(kind, userId, detail.slice(0, 200));
  } catch (err) {
    console.error("[quest-board] security log", err);
  }
}

export type SecurityEvent = { id: number; kind: SecurityEventKind; user_id: number | null; name: string | null; detail: string; created_at: string };

/** The newest events, with the account's name, for the admin Errors page. */
export function recentSecurityEvents(limit = 50): SecurityEvent[] {
  return db()
    .prepare(
      `SELECT e.id, e.kind, e.user_id, u.name, e.detail, e.created_at
         FROM security_events e LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.id DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(1, limit), 200)) as SecurityEvent[];
}

/** Delete events past the keeping period (the only deletes the table allows). Run by the cron. */
export function pruneSecurityEvents(now = Date.now()): number {
  const cutoff = new Date(now - SECURITY_KEEP_DAYS * 86_400_000).toISOString();
  return Number(db().prepare("DELETE FROM security_events WHERE created_at < ?").run(cutoff).changes);
}
