import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { fixedWindow } from "./policy";

// Fixed-window limits per action. Identity is the client IP (for anonymous
// actions) or the user id. Kept generous so real people never notice them.
export const LIMITS = {
  login: { limit: 10, windowMs: 10 * 60_000 },   // per IP + email
  signup: { limit: 10, windowMs: 60 * 60_000 },  // per IP
  chat: { limit: 30, windowMs: 10 * 60_000 },    // per user
  reserve: { limit: 30, windowMs: 10 * 60_000 }, // per user
  review: { limit: 10, windowMs: 60 * 60_000 },  // per user
  request: { limit: 5, windowMs: 60 * 60_000 },  // GM requests per user
  offer: { limit: 30, windowMs: 60 * 60_000 },   // offers per GM
  password: { limit: 5, windowMs: 15 * 60_000 }, // password changes per user
  reset: { limit: 5, windowMs: 60 * 60_000 },    // "forgot password" emails per IP + email
  verify: { limit: 5, windowMs: 60 * 60_000 },   // verification emails per user
  deleteAccount: { limit: 5, windowMs: 60 * 60_000 }, // deletion attempts per user
  report: { limit: 10, windowMs: 60 * 60_000 },  // reports per user
  notice: { limit: 5, windowMs: 24 * 60 * 60_000 }, // notice-board posts per user per day
  noticeReply: { limit: 30, windowMs: 60 * 60_000 }, // notice-board replies per user
} as const;

export type Bucket = keyof typeof LIMITS;

/** Best-effort client IP. Behind a proxy, only trust X-Forwarded-For if the proxy sets it. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/**
 * Per-bucket limit overrides, e.g. QUESTBOARD_RATE_LIMIT_OVERRIDES="signup=500,request=100".
 * Meant for e2e runs that create many accounts from one IP; production uses LIMITS.
 */
function limitFor(bucket: Bucket): number {
  const raw = process.env.QUESTBOARD_RATE_LIMIT_OVERRIDES;
  if (raw) {
    for (const part of raw.split(",")) {
      const [k, v] = part.split("=").map((x) => x.trim());
      if (k === bucket && Number(v) > 0) return Number(v);
    }
  }
  return LIMITS[bucket].limit;
}

/** Record a hit. Returns false when the caller is over the limit. */
export function hit(bucket: Bucket, identity: string, nowMs = Date.now()): boolean {
  if (process.env.QUESTBOARD_RATE_LIMIT === "off") return true;
  const { windowMs } = LIMITS[bucket];
  const limit = limitFor(bucket);
  const key = `${bucket}:${identity}`;
  const row = db().prepare("SELECT window_start AS windowStart, count FROM rate_limits WHERE key = ?").get(key) as
    | { windowStart: number; count: number }
    | undefined;
  const result = fixedWindow(row, nowMs, limit, windowMs);
  if (result.allowed) {
    db()
      .prepare(
        "INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET window_start = excluded.window_start, count = excluded.count",
      )
      .run(key, result.next.windowStart, result.next.count);
  }
  return result.allowed;
}

/** Drop windows older than a day. Called opportunistically (e.g. on login). */
export function purgeOldWindows(nowMs = Date.now()) {
  db().prepare("DELETE FROM rate_limits WHERE window_start < ?").run(nowMs - 86_400_000);
}
