import "server-only";
import { db, tx } from "./db";
import { hashToken, newSessionToken } from "./password";
import { logAdminAction } from "./moderation";

// Founding-GM invitations (Admin → GMs): a single-use link that makes whoever accepts it a verified GM,
// so the first GMs don't wait in the verification queue. Only the token's SHA-256 is stored.

export const INVITE_TTL_MS = 30 * 24 * 60 * 60_000;

export type InviteRow = { id: number; note: string; created_at: string; expires_at: string; used_at: string | null; used_by_name: string | null; status: "open" | "used" | "expired" };

export function createGmInvite(adminId: number, note: string): string {
  const raw = newSessionToken();
  db()
    .prepare("INSERT INTO gm_invites (token_hash, note, created_by, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(raw), note.trim().slice(0, 100), adminId, new Date(Date.now() + INVITE_TTL_MS).toISOString());
  logAdminAction(adminId, "gm_invite", null, note.trim().slice(0, 100));
  return raw;
}

export function listGmInvites(limit = 20): InviteRow[] {
  const now = new Date().toISOString();
  const rows = db()
    .prepare(
      `SELECT i.id, i.note, i.created_at, i.expires_at, i.used_at, u.name AS used_by_name
         FROM gm_invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.id DESC LIMIT ?`,
    )
    .all(limit) as Omit<InviteRow, "status">[];
  return rows.map((r) => ({ ...r, status: r.used_at ? "used" : r.expires_at <= now ? "expired" : "open" }));
}

/** A still-usable invite, and who sent it (for the invite page). */
export function peekGmInvite(raw: string): { id: number; inviter: string | null } | null {
  if (!raw) return null;
  const row = db()
    .prepare(
      `SELECT i.id, u.name AS inviter FROM gm_invites i LEFT JOIN users u ON u.id = i.created_by
        WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`,
    )
    .get(hashToken(raw), new Date().toISOString()) as { id: number; inviter: string | null } | undefined;
  return row ?? null;
}

/**
 * Use the invite once: the account becomes a GM (admins stay admins) with a verified GM profile.
 * False when the link is unknown, used or expired.
 */
export function acceptGmInvite(raw: string, userId: number): boolean {
  return tx((c) => {
    const now = new Date().toISOString();
    const inv = c
      .prepare("UPDATE gm_invites SET used_by = ?, used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING created_by, note")
      .get(userId, now, hashToken(raw), now) as { created_by: number | null; note: string } | undefined;
    if (!inv) return false;
    c.prepare("UPDATE users SET role = 'gm' WHERE id = ? AND role = 'player'").run(userId);
    c.prepare("INSERT OR IGNORE INTO gm_profiles (user_id) VALUES (?)").run(userId);
    c.prepare("UPDATE gm_profiles SET verified = 1 WHERE user_id = ?").run(userId);
    if (inv.created_by) logAdminAction(inv.created_by, "gm_invite_accepted", userId, inv.note, c);
    return true;
  });
}

/** An admin takes back a link that hasn't been used. */
export function revokeGmInvite(id: number): boolean {
  return Number(db().prepare("UPDATE gm_invites SET expires_at = ? WHERE id = ? AND used_at IS NULL").run(new Date().toISOString(), id).changes) > 0;
}
