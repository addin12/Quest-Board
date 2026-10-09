// Pure business rules: pricing display, seat availability, cancellation.
// No runtime imports so it can be unit tested with `node --test` directly.
//
// Quest Board takes no commission and processes no payments: the GM sets a
// price per seat and the player pays the GM directly. The platform only
// reserves seats.

import type { MsgKey } from "./i18n/dict";

/** Upper bound for a seat price, in whole Rupiah. */
export const MAX_PRICE_IDR = 10_000_000;

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

/**
 * "Rp 75.000". Rupiah has no minor unit, so amounts are whole integers.
 * @example formatIdr(75000) // "Rp 75.000"
 */
export function formatIdr(amount: number): string {
  return idr.format(amount).replace(/ /g, " ");
}

/**
 * Parse user input such as "75.000", "Rp 75,000" or "75000" into whole Rupiah.
 * @example parseIdr("75.000") // 75000 · parseIdr("") // 0 · parseIdr("gratis") // null
 */
export function parseIdr(input: string): number | null {
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return input.trim() === "" ? 0 : null;
  return Number(digits);
}

export type BookabilityInput = {
  sessionStatus: string;
  gameStatus: string;
  startsAt: Date;
  now: Date;
  seatsTotal: number;
  seatsTaken: number;
  isGm: boolean;
  alreadyBooked: boolean;
  removedByGm?: boolean; // the GM released this player's seat in this session
};

export type BookabilityResult = { ok: true } | { ok: false; reason: MsgKey };

export function canBook(i: BookabilityInput): BookabilityResult {
  if (i.isGm) return { ok: false, reason: "err.ownGame" };
  if (i.gameStatus !== "published") return { ok: false, reason: "err.notAccepting" };
  if (i.sessionStatus !== "scheduled") return { ok: false, reason: "err.notScheduled" };
  if (i.startsAt.getTime() <= i.now.getTime()) return { ok: false, reason: "err.started" };
  if (i.alreadyBooked) return { ok: false, reason: "err.alreadyBooked" };
  if (i.removedByGm) return { ok: false, reason: "err.removedByGm" };
  if (i.seatsTaken >= i.seatsTotal) return { ok: false, reason: "err.full" };
  return { ok: true };
}

/**
 * Players may give up their seat any time before the session starts.
 * @example canCancel(new Date("2026-10-20T11:00Z"), new Date("2026-10-20T10:00Z")) // true
 */
export function canCancel(sessionStartsAt: Date, now: Date): boolean {
  return sessionStartsAt.getTime() > now.getTime();
}

/**
 * Escape LIKE wildcards so user input matches literally. Use with `ESCAPE '\'`.
 * @example db.prepare("… WHERE title LIKE ? ESCAPE '\\'").all(`%${escapeLike("50%_off")}%`)
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type RateWindow = { windowStart: number; count: number };

/**
 * Fixed-window rate limiting. Given the stored window (if any), decide whether
 * this hit is allowed and return the window to store next.
 */
/**
 * The client address from X-Forwarded-For, trusting only the `hops` right-most entries (added by
 * our own proxies). With no header (direct/local), falls back to X-Real-IP, then "local".
 */
export function clientIpFrom(xff: string | null, realIp: string | null, hops = 1): string {
  const list = (xff ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const n = Number.isInteger(hops) && hops > 0 ? hops : 1;
  if (list.length > 0) return list[Math.max(0, list.length - n)];
  return realIp?.trim() || "local";
}

/** A post-login redirect target on this site: "/path", never "//host", "/\\host" or a control character. */
export function isSafeNext(v: unknown): v is string {
  return typeof v === "string" && v.startsWith("/") && !/^\/[\/\\]/.test(v) && !/[\u0000-\u001f\\]/.test(v) && v.length <= 512;
}

export function fixedWindow(
  prev: RateWindow | undefined,
  nowMs: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; next: RateWindow; retryAfterMs: number } {
  const current = prev && nowMs - prev.windowStart < windowMs ? prev : { windowStart: nowMs, count: 0 };
  if (current.count >= limit) {
    return { allowed: false, next: current, retryAfterMs: current.windowStart + windowMs - nowMs };
  }
  return { allowed: true, next: { windowStart: current.windowStart, count: current.count + 1 }, retryAfterMs: 0 };
}

/** Stored value for GMs who only play online. */
export const ONLINE_LOCATION = "Online";

/**
 * GM location: a city (e.g. "Jakarta", "Bandung") or "Online".
 * Empty input and any casing of "online" become "Online"; whitespace is tidied.
 */
export function normalizeLocation(input: string): string {
  const v = input.replace(/\s+/g, " ").trim().slice(0, 60);
  return !v || /^online$/i.test(v) ? ONLINE_LOCATION : v;
}

export function isOnlineLocation(location: string): boolean {
  return /^online$/i.test(location.trim());
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "game"
  );
}

/** @example splitList("D&D 5e, Pathfinder ,") // ["D&D 5e", "Pathfinder"] */
export function splitList(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
