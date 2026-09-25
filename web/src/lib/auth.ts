import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { hashToken, newSessionToken } from "./password";

export const SESSION_COOKIE = "qb_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: number;
  email: string;
  name: string;
  role: "player" | "gm" | "admin";
  avatar_hue: number;
  avatar_image: string;
};

export async function createSession(userId: number) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  db()
    .prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), userId, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db().prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/** Issue a fresh token and revoke the current one (use after privilege changes). */
export async function rotateSession(userId: number) {
  await destroySession();
  await createSession(userId);
}

/** "Log out everywhere": revoke every session of this user, including the current one. */
export async function destroyAllSessions(userId: number) {
  db().prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
  (await cookies()).delete(SESSION_COOKIE);
}

export function purgeExpiredSessions() {
  db().prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(new Date().toISOString());
}

/** The signed-in user for this request, or null. Memoised per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.avatar_hue, u.avatar_image, s.expires_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as (CurrentUser & { expires_at: string }) | undefined;
  if (!row || new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role, avatar_hue: row.avatar_hue, avatar_image: row.avatar_image };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requireGm(): Promise<CurrentUser> {
  const user = await requireUser("/gm");
  if (user.role !== "gm" && user.role !== "admin") redirect("/become-a-gm");
  return user;
}
