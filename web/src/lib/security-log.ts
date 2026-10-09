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
  | "admin_denied"       // an admin account without two-step was sent to set it up
  | "login_warning_sent"; // the account's owner was emailed about failed attempts; detail "password" | "code"

export const SECURITY_KEEP_DAYS = 180;

/** Kinds a script can repeat thousands of times: logged once per account per hour, and counted. */
const REPEATING: ReadonlySet<SecurityEventKind> = new Set(["login_failed", "two_step_failed"]);
const hourOf = (at: Date) => at.toISOString().slice(0, 13);

/**
 * Record a security event. Failed logins and wrong codes are counted per account (0 = no such account)
 * per hour in security_counters, and only the first of each hour becomes a log row: at most 24 rows a day
 * per account, and 24 for every unknown email put together. Never throws: logging must not break the
 * login or the change it records. Returns this hour's count for repeating kinds (1 otherwise).
 */
export function logSecurityEvent(kind: SecurityEventKind, userId: number | null, detail = "", now = new Date()): number {
  try {
    if (REPEATING.has(kind)) {
      const { n } = db()
        .prepare("INSERT INTO security_counters (kind, user_id, hour, n) VALUES (?, ?, ?, 1) ON CONFLICT(kind, user_id, hour) DO UPDATE SET n = n + 1 RETURNING n")
        .get(kind, userId ?? 0, hourOf(now)) as { n: number };
      if (n > 1) return n; // already in the log for this hour: counted, not repeated
    }
    db().prepare("INSERT INTO security_events (kind, user_id, detail, created_at) VALUES (?, ?, ?, ?)").run(kind, userId, detail.slice(0, 200), now.toISOString());
    return 1;
  } catch (err) {
    console.error("[quest-board] security log", err);
    return 0;
  }
}

/** Failed attempts on an account this hour and the hour before ("in about the last hour"). */
export function recentAttempts(kind: "login_failed" | "two_step_failed", userId: number, now = new Date()): number {
  const hours = [hourOf(now), hourOf(new Date(now.getTime() - 3_600_000))];
  const row = db().prepare("SELECT COALESCE(SUM(n), 0) AS n FROM security_counters WHERE kind = ? AND user_id = ? AND hour IN (?, ?)").get(kind, userId, ...hours) as { n: number };
  return row.n;
}

/** Warn the owner after this many wrong passwords, or this many wrong codes (they have the password). */
export const WARN_AFTER = { password: 5, code: 3 } as const;

/**
 * Should the account's owner be emailed now? "code" when someone passed the password but failed the
 * two-step code (more serious), "password" after repeated wrong passwords; at most one email a day.
 */
export function failedLoginWarning(userId: number, now = new Date()): { reason: "password" | "code"; attempts: number } | null {
  const codes = recentAttempts("two_step_failed", userId, now);
  const passwords = recentAttempts("login_failed", userId, now);
  const reason = codes >= WARN_AFTER.code ? "code" : passwords >= WARN_AFTER.password ? "password" : null;
  if (!reason) return null;
  const since = new Date(now.getTime() - 86_400_000).toISOString();
  if (db().prepare("SELECT 1 FROM security_events WHERE kind = 'login_warning_sent' AND user_id = ? AND created_at > ?").get(userId, since)) return null;
  return { reason, attempts: reason === "code" ? codes : passwords };
}

export type SecurityEvent = { id: number; kind: SecurityEventKind; user_id: number | null; name: string | null; detail: string; created_at: string; times: number };

/** The newest events (everyone's, or one account's), with the name and how often it happened that hour. */
export function recentSecurityEvents(limit = 50, userId?: number): SecurityEvent[] {
  return db()
    .prepare(
      `SELECT e.id, e.kind, e.user_id, u.name, e.detail, e.created_at, COALESCE(c.n, 1) AS times
         FROM security_events e
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN security_counters c ON c.kind = e.kind AND c.user_id = COALESCE(e.user_id, 0) AND c.hour = substr(e.created_at, 1, 13)
        WHERE (? IS NULL OR e.user_id = ?)
        ORDER BY e.id DESC LIMIT ?`,
    )
    .all(userId ?? null, userId ?? null, Math.min(Math.max(1, limit), 200)) as SecurityEvent[];
}

/** Delete events past the keeping period (the only deletes the table allows). Run by the cron. */
export function pruneSecurityEvents(now = Date.now()): number {
  const cutoff = new Date(now - SECURITY_KEEP_DAYS * 86_400_000).toISOString();
  db().prepare("DELETE FROM security_counters WHERE hour < ?").run(cutoff.slice(0, 13));
  return Number(db().prepare("DELETE FROM security_events WHERE created_at < ?").run(cutoff).changes);
}
