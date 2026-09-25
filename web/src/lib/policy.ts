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

/** "Rp 75.000". Rupiah has no minor unit, so amounts are whole integers. */
export function formatIdr(amount: number): string {
  return idr.format(amount).replace(/ /g, " ");
}

/** Parse user input such as "75.000", "Rp 75,000" or "75000" into whole Rupiah. */
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
};

export type BookabilityResult = { ok: true } | { ok: false; reason: MsgKey };

export function canBook(i: BookabilityInput): BookabilityResult {
  if (i.isGm) return { ok: false, reason: "err.ownGame" };
  if (i.gameStatus !== "published") return { ok: false, reason: "err.notAccepting" };
  if (i.sessionStatus !== "scheduled") return { ok: false, reason: "err.notScheduled" };
  if (i.startsAt.getTime() <= i.now.getTime()) return { ok: false, reason: "err.started" };
  if (i.alreadyBooked) return { ok: false, reason: "err.alreadyBooked" };
  if (i.seatsTaken >= i.seatsTotal) return { ok: false, reason: "err.full" };
  return { ok: true };
}

/** Players may give up their seat any time before the session starts. */
export function canCancel(sessionStartsAt: Date, now: Date): boolean {
  return sessionStartsAt.getTime() > now.getTime();
}

/** Escape LIKE wildcards so user input matches literally. Use with `ESCAPE '\'`. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type RateWindow = { windowStart: number; count: number };

/**
 * Fixed-window rate limiting. Given the stored window (if any), decide whether
 * this hit is allowed and return the window to store next.
 */
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

export function splitList(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
