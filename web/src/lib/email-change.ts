import "server-only";
import { db } from "./db";
import { hashToken, newSessionToken } from "./password";

// Changing the login email (Settings → Login email). The new address gets a single-use link (only its
// SHA-256 is stored, like other tokens); the change happens when that link is confirmed. A newer request,
// a password reset or an expired link (24 hours) leaves the address as it was.

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60_000;

/** Start a change; any older pending change for this user stops working. Returns the raw token. */
export function requestEmailChange(userId: number, newEmail: string): string {
  const raw = newSessionToken();
  const now = new Date();
  cancelEmailChanges(userId, now);
  db()
    .prepare("INSERT INTO email_changes (user_id, new_email, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .run(userId, newEmail, hashToken(raw), new Date(now.getTime() + EMAIL_CHANGE_TTL_MS).toISOString());
  return raw;
}

/** A still-valid change, without using it up (the confirmation page shows the new address). */
export function peekEmailChange(raw: string): { userId: number; newEmail: string } | null {
  if (!raw) return null;
  const row = db()
    .prepare("SELECT user_id, new_email FROM email_changes WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .get(hashToken(raw), new Date().toISOString()) as { user_id: number; new_email: string } | undefined;
  return row ? { userId: row.user_id, newEmail: row.new_email } : null;
}

/** Use the link once. Returns the change, or null if it is unknown, expired, replaced or used. */
export function consumeEmailChange(raw: string): { userId: number; newEmail: string } | null {
  if (!raw) return null;
  const now = new Date().toISOString();
  const row = db()
    .prepare("UPDATE email_changes SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id, new_email")
    .get(now, hashToken(raw), now) as { user_id: number; new_email: string } | undefined;
  return row ? { userId: row.user_id, newEmail: row.new_email } : null;
}

/** Drop pending changes (a newer request, or a password reset: maybe someone else asked for it). */
export function cancelEmailChanges(userId: number, now = new Date()) {
  db().prepare("UPDATE email_changes SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(now.toISOString(), userId);
}

/** The address a pending change goes to, for the Settings page. */
export function pendingEmailChange(userId: number): string | null {
  const row = db()
    .prepare("SELECT new_email FROM email_changes WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1")
    .get(userId, new Date().toISOString()) as { new_email: string } | undefined;
  return row?.new_email ?? null;
}
