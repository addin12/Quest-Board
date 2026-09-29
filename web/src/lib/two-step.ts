import "server-only";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { db } from "./db";
import { hashToken, newSessionToken } from "./password";
import { secureCookies } from "./auth";
import { newTotpSecret, otpauthUri, verifyTotp } from "./totp";

// Two-step login (TOTP), offered to GMs and admins. After the right password, an account with it on gets
// a short-lived login step (login_challenges + the qb_2fa cookie) instead of a session; the
// session starts only after a code from the authenticator app. A lost phone is reset from the
// server: `npm run admin -- reset-2fa <email>`.

export const CHALLENGE_COOKIE = "qb_2fa";
const CHALLENGE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

type TwoStepRow = { totp_secret: string | null; totp_enabled_at: string | null; totp_last_step: number };
const row = (userId: number) =>
  db().prepare("SELECT totp_secret, totp_enabled_at, totp_last_step FROM users WHERE id = ?").get(userId) as TwoStepRow | undefined;

export type TwoStepState =
  | { state: "off" }
  | { state: "pending"; secret: string; qr: string } // set up, waiting for the first code
  | { state: "on"; since: string };

export async function twoStepState(userId: number, email: string): Promise<TwoStepState> {
  const r = row(userId);
  if (r?.totp_enabled_at) return { state: "on", since: r.totp_enabled_at };
  if (!r?.totp_secret) return { state: "off" };
  const svg = await QRCode.toString(otpauthUri("Quest Board", email, r.totp_secret), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { state: "pending", secret: r.totp_secret, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

export const twoStepEnabled = (userId: number) => !!row(userId)?.totp_enabled_at;

/**
 * A verified GM — the accounts players trust most with money — needs two-step login before changing
 * their GM profile or payment details (their games keep running meanwhile).
 */
export function verifiedGmNeedsTwoStep(userId: number): boolean {
  const r = db().prepare("SELECT COALESCE(p.verified, 0) AS verified, u.totp_enabled_at FROM users u LEFT JOIN gm_profiles p ON p.user_id = u.id WHERE u.id = ?")
    .get(userId) as { verified: number; totp_enabled_at: string | null } | undefined;
  return !!r?.verified && !r.totp_enabled_at;
}

/** Start (or restart) setup: a new secret, not yet required at login. */
export function beginSetup(userId: number) {
  db().prepare("UPDATE users SET totp_secret = ?, totp_enabled_at = NULL, totp_last_step = -1 WHERE id = ? AND totp_enabled_at IS NULL")
    .run(newTotpSecret(), userId);
}

export function cancelSetup(userId: number) {
  db().prepare("UPDATE users SET totp_secret = NULL WHERE id = ? AND totp_enabled_at IS NULL").run(userId);
}

/** Checks a code against the account's secret; on success, uses it up (each code works once). */
function spendCode(userId: number, code: string): boolean {
  const r = row(userId);
  if (!r?.totp_secret) return false;
  const step = verifyTotp(r.totp_secret, code, Date.now(), r.totp_last_step);
  if (step === null) return false;
  // Conditional on the old value: two requests racing with the same code can't both win.
  return db().prepare("UPDATE users SET totp_last_step = ? WHERE id = ? AND totp_last_step = ?").run(step, userId, r.totp_last_step).changes === 1;
}

/** The first code from the app turns it on. */
export function confirmSetup(userId: number, code: string): boolean {
  const r = row(userId);
  if (!r?.totp_secret || r.totp_enabled_at || !spendCode(userId, code)) return false;
  db().prepare("UPDATE users SET totp_enabled_at = ? WHERE id = ?").run(new Date().toISOString(), userId);
  return true;
}

/** Turning it off takes a current code, so a stolen session alone can't. */
export function disable(userId: number, code: string): boolean {
  if (!twoStepEnabled(userId) || !spendCode(userId, code)) return false;
  db().prepare("UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = -1 WHERE id = ?").run(userId);
  db().prepare("DELETE FROM login_challenges WHERE user_id = ?").run(userId);
  return true;
}

// ─── The login step ─────────────────────────────────────────────────────

export async function startChallenge(userId: number, next: string) {
  const token = newSessionToken();
  const expires = new Date(Date.now() + CHALLENGE_MINUTES * 60_000);
  db().prepare("DELETE FROM login_challenges WHERE expires_at < ?").run(new Date().toISOString());
  db().prepare("INSERT INTO login_challenges (token_hash, user_id, next_path, expires_at) VALUES (?, ?, ?, ?)")
    .run(hashToken(token), userId, next, expires.toISOString());
  (await cookies()).set(CHALLENGE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", expires });
}

type Challenge = { token_hash: string; user_id: number; next_path: string; attempts: number };

/** The pending login step of this browser, if any. */
export async function currentChallenge(): Promise<Challenge | null> {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  return (db().prepare("SELECT token_hash, user_id, next_path, attempts FROM login_challenges WHERE token_hash = ? AND expires_at > ?")
    .get(hashToken(token), new Date().toISOString()) as Challenge | undefined) ?? null;
}

export async function endChallenge(c?: Challenge | null) {
  if (c) db().prepare("DELETE FROM login_challenges WHERE token_hash = ?").run(c.token_hash);
  (await cookies()).delete(CHALLENGE_COOKIE);
}

/** "ok", "wrong" (try again) or "locked" (too many wrong codes: log in again). */
export async function answerChallenge(c: Challenge, code: string): Promise<"ok" | "wrong" | "locked"> {
  if (spendCode(c.user_id, code)) return "ok";
  const attempts = c.attempts + 1;
  if (attempts >= MAX_CODE_ATTEMPTS) { await endChallenge(c); return "locked"; }
  db().prepare("UPDATE login_challenges SET attempts = ? WHERE token_hash = ?").run(attempts, c.token_hash);
  return "wrong";
}
