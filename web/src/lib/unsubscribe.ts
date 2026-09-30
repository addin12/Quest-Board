import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db";

// One-click unsubscribe (RFC 8058) for the emails people can turn off: notification emails and session
// reminders. Their List-Unsubscribe link carries a token signed with a key kept in app_state, so it
// can't be guessed or reused for someone else; POST to it turns the matching setting off. Security
// emails and warnings (ALWAYS_EMAIL) never carry it.

export type UnsubscribeKind = "notifications" | "reminders";
export const isUnsubscribeKind = (v: unknown): v is UnsubscribeKind => v === "notifications" || v === "reminders";
const COLUMN: Record<UnsubscribeKind, string> = { notifications: "email_notifications", reminders: "email_reminders" };

function key(): string {
  const row = db().prepare("SELECT value FROM app_state WHERE key = 'unsubscribe_key'").get() as { value: string } | undefined;
  if (row) return row.value;
  const k = randomBytes(32).toString("base64url");
  db().prepare("INSERT OR IGNORE INTO app_state (key, value) VALUES ('unsubscribe_key', ?)").run(k);
  return (db().prepare("SELECT value FROM app_state WHERE key = 'unsubscribe_key'").get() as { value: string }).value;
}

export const unsubscribeToken = (userId: number, kind: UnsubscribeKind) =>
  createHmac("sha256", key()).update(`${userId}:${kind}`).digest("base64url").slice(0, 32);

/** The List-Unsubscribe headers for one email. */
export function unsubscribeHeaders(origin: string, userId: number, kind: UnsubscribeKind): Record<string, string> {
  const url = `${origin}/api/unsubscribe?u=${userId}&k=${kind}&t=${unsubscribeToken(userId, kind)}`;
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** The user the link is for, if its token is right. */
export function checkUnsubscribe(u: unknown, k: unknown, t: unknown): { userId: number; kind: UnsubscribeKind } | null {
  const userId = Number(u);
  if (!Number.isInteger(userId) || userId <= 0 || !isUnsubscribeKind(k) || typeof t !== "string") return null;
  const want = Buffer.from(unsubscribeToken(userId, k));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got) ? { userId, kind: k } : null;
}

/** Turn that kind of email off. */
export function applyUnsubscribe(userId: number, kind: UnsubscribeKind) {
  db().prepare(`UPDATE users SET ${COLUMN[kind]} = 0 WHERE id = ?`).run(userId);
}
