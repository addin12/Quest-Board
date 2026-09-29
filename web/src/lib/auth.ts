import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { hashToken, newSessionToken } from "./password";
import { getLang } from "./i18n/server";
import { deviceLabel } from "./device";
import { noteDevice, sendNewDeviceEmail } from "./login-devices";

import { SESSION_COOKIE, SESSION_DAYS, secureCookies, sessionCookieOptions } from "./session-cookie";
export { SESSION_COOKIE, secureCookies };

export type CurrentUser = {
  id: number;
  email: string;
  name: string;
  role: "player" | "gm" | "admin";
  avatar_hue: number;
  avatar_image: string;
  email_verified: boolean;
  /** The Terms/Privacy version whose update banner they've seen (lib/legal.ts). */
  legal_seen_version: string;
  /** Admin powers: an admin WITH two-step login (see adminPowers). Use this, not role, for anything only admins may do. */
  admin: boolean;
};

/**
 * Admin powers need two-step login: a leaked admin password alone must not open the console or act
 * on other people's games. QUESTBOARD_ADMIN_TWO_STEP=optional is for the e2e servers only (their demo
 * admin logs in with a password) — never set it in production.
 */
export const adminPowers = (role: string, twoStepOn: boolean) => role === "admin" && (twoStepOn || process.env.QUESTBOARD_ADMIN_TWO_STEP === "optional");

export async function createSession(userId: number) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const now = new Date().toISOString();
  const device = deviceLabel((await headers()).get("user-agent"));
  db()
    .prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at, last_seen_at, device) VALUES (?, ?, ?, ?, ?, ?)")
    .run(hashToken(token), userId, expires.toISOString(), now, now, device);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  // "Was this you?" — for a browser this account hasn't used before (not its very first one).
  if (await noteDevice(userId, device)) await sendNewDeviceEmail(userId, device);
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
      `SELECT u.id, u.email, u.name, u.role, u.avatar_hue, u.avatar_image, u.email_verified_at, u.locale, u.legal_seen_version, u.totp_enabled_at, s.expires_at, s.last_seen_at
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND u.deleted_at IS NULL AND u.suspended_at IS NULL`,
    )
    .get(hashToken(token)) as (Omit<CurrentUser, "email_verified"> & { email_verified_at: string | null; locale: string; expires_at: string; last_seen_at: string | null; totp_enabled_at: string | null }) | undefined;
  if (!row || new Date(row.expires_at) < new Date()) return null;
  // "Last active" in Settings → Where you're logged in, and the sliding expiry: SESSION_DAYS after the
  // last visit, not after the login (src/proxy.ts renews the cookie). At most one write per 10 minutes.
  if (!row.last_seen_at || Date.now() - Date.parse(row.last_seen_at) > 10 * 60_000) {
    db().prepare("UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")
      .run(new Date().toISOString(), new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(), hashToken(token));
  }
  // Emails and reminders go out in the language the person last used the site in.
  const lang = await getLang();
  if (row.locale !== lang) db().prepare("UPDATE users SET locale = ? WHERE id = ?").run(lang, row.id);
  return {
    id: row.id, email: row.email, name: row.name, role: row.role, avatar_hue: row.avatar_hue, avatar_image: row.avatar_image,
    email_verified: !!row.email_verified_at, legal_seen_version: row.legal_seen_version,
    admin: adminPowers(row.role, !!row.totp_enabled_at),
  };
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

/**
 * Admin console guard: anyone else gets a plain 404 (the console's existence isn't advertised). An
 * admin without two-step login is sent to set it up first (adminPowers).
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") notFound();
  if (!user.admin) redirect("/settings?twoStep=required#two-step");
  return user;
}

export async function requireGm(): Promise<CurrentUser> {
  const user = await requireUser("/gm");
  if (user.role !== "gm" && user.role !== "admin") redirect("/become-a-gm");
  return user;
}
