import "server-only";
import { cookies, headers } from "next/headers";
import { db } from "./db";
import { hashToken, newSessionToken } from "./password";
import { SESSION_COOKIE, secureCookies } from "./auth";
import { deviceLabel } from "./device";
import { sendEmail } from "./mailer";
import { hit } from "./rate-limit";
import { siteOrigin } from "./site";
import { makeT, type Lang } from "./i18n/dict";
import { formatMoment } from "./time-zones";

// Where you're logged in, and "a new device just logged in to your account". A long-lived random
// cookie (qb_device) recognises browsers this account has used before (login_devices keeps only its
// hash); a login from an unrecognised one is emailed — unless it's the account's very first device.

export const DEVICE_COOKIE = "qb_device";
const DEVICE_COOKIE_DAYS = 730;

export async function currentDevice(): Promise<string> {
  return deviceLabel((await headers()).get("user-agent"));
}

/** Records this browser for the account. True when it's new for an account that had used others. */
export async function noteDevice(userId: number, device: string): Promise<boolean> {
  const jar = await cookies();
  let token = jar.get(DEVICE_COOKIE)?.value;
  if (!token || !/^[\w-]{32,}$/.test(token)) {
    token = newSessionToken();
    jar.set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: DEVICE_COOKIE_DAYS * 86_400 });
  }
  const hash = hashToken(token);
  const now = new Date().toISOString();
  const known = db().prepare("UPDATE login_devices SET last_seen_at = ?, device = ? WHERE user_id = ? AND device_hash = ?").run(now, device, userId, hash).changes > 0;
  if (known) return false;
  const hadOthers = !!db().prepare("SELECT 1 FROM login_devices WHERE user_id = ?").get(userId);
  db().prepare("INSERT INTO login_devices (user_id, device_hash, device, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").run(userId, hash, device, now, now);
  return hadOthers;
}

/** "Your account was just logged in to from a new device — if it wasn't you…" (in their language). */
export async function sendNewDeviceEmail(userId: number, device: string) {
  if (!hit("newDevice", String(userId))) return; // a flood of logins shouldn't become a flood of email
  const u = db().prepare("SELECT email, name, locale, time_zone FROM users WHERE id = ?").get(userId) as { email: string; name: string; locale: Lang; time_zone: string } | undefined;
  if (!u) return;
  const t = makeT(u.locale);
  const origin = await siteOrigin();
  const when = formatMoment(new Date(), u.locale, u.time_zone);
  await sendEmail({
    to: u.email,
    subject: t("mail.newDeviceSubject"),
    text: t("mail.newDeviceBody", { name: u.name, device: device || t("devices.unknown"), when, reset: `${origin}/forgot-password`, settings: `${origin}/settings#devices` }),
  });
}

export type LoginRow = { id: number; device: string; created_at: string | null; last_seen_at: string | null; current: boolean };

/** This account's live sessions, most recently active first; `current` is the one reading this. */
export async function listLogins(userId: number): Promise<LoginRow[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const mine = token ? hashToken(token) : "";
  const rows = db()
    .prepare(
      `SELECT rowid AS id, device, created_at, last_seen_at, token_hash = ? AS current FROM auth_sessions
        WHERE user_id = ? AND expires_at > ? ORDER BY current DESC, COALESCE(last_seen_at, created_at) DESC`,
    )
    .all(mine, userId, new Date().toISOString()) as (Omit<LoginRow, "current"> & { current: number })[];
  return rows.map((r) => ({ ...r, current: !!r.current }));
}

/** Log out one of my other sessions. */
export async function endLogin(userId: number, id: number): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return db().prepare("DELETE FROM auth_sessions WHERE rowid = ? AND user_id = ? AND token_hash <> ?").run(id, userId, token ? hashToken(token) : "").changes > 0;
}
