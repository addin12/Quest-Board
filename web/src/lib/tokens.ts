import "server-only";
import { db } from "./db";
import { hashToken, newSessionToken } from "./password";

// Single-use tokens sent by email. Only the SHA-256 hash is stored (like session tokens),
// so a database leak can't be used to reset passwords.

export type TokenKind = "reset" | "verify";

export const TOKEN_TTL_MS: Record<TokenKind, number> = {
  reset: 60 * 60_000,          // 1 hour
  verify: 7 * 24 * 60 * 60_000, // 7 days
};

/** Issue a new token; any older unused token of the same kind for this user stops working. */
export function issueToken(userId: number, kind: TokenKind): string {
  const raw = newSessionToken();
  const now = new Date();
  db().prepare("UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL").run(now.toISOString(), userId, kind);
  db()
    .prepare("INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?)")
    .run(userId, kind, hashToken(raw), new Date(now.getTime() + TOKEN_TTL_MS[kind]).toISOString());
  return raw;
}

/** The user a still-valid token belongs to, without using it up (e.g. to show the reset form). */
export function peekToken(raw: string, kind: TokenKind): number | null {
  if (!raw) return null;
  const row = db()
    .prepare("SELECT user_id FROM auth_tokens WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?")
    .get(hashToken(raw), kind, new Date().toISOString()) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}

/** Use a token once. Returns its user, or null if it is unknown, expired or already used. */
export function consumeToken(raw: string, kind: TokenKind): number | null {
  if (!raw) return null;
  const now = new Date().toISOString();
  const row = db()
    .prepare(
      `UPDATE auth_tokens SET used_at = ?
        WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?
        RETURNING user_id`,
    )
    .get(now, hashToken(raw), kind, now) as { user_id: number } | undefined;
  return row?.user_id ?? null;
}
