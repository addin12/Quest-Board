import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { clientIpFrom, fixedWindow } from "./policy";

// Fixed-window limits per action. Identity is the client IP (for anonymous
// actions) or the user id. Kept generous so real people never notice them.
export const LIMITS = {
  login: { limit: 10, windowMs: 10 * 60_000 },   // per IP + email
  loginIp: { limit: 60, windowMs: 10 * 60_000 }, // per IP, any email (credential stuffing)
  signup: { limit: 10, windowMs: 60 * 60_000 },  // per IP
  signupNotice: { limit: 2, windowMs: 60 * 60_000 }, // "someone tried to sign up with your email", per address
  chat: { limit: 30, windowMs: 10 * 60_000 },    // per user
  reserve: { limit: 30, windowMs: 10 * 60_000 }, // per user
  review: { limit: 10, windowMs: 60 * 60_000 },  // per user
  request: { limit: 5, windowMs: 60 * 60_000 },  // GM requests per user
  offer: { limit: 30, windowMs: 60 * 60_000 },   // offers per GM
  password: { limit: 5, windowMs: 15 * 60_000 }, // password changes per user
  reset: { limit: 5, windowMs: 60 * 60_000 },    // "forgot password" emails per IP + email
  resetIp: { limit: 20, windowMs: 60 * 60_000 }, // per IP, any email (no mass reset emails)
  verify: { limit: 5, windowMs: 60 * 60_000 },   // verification emails per user
  deleteAccount: { limit: 5, windowMs: 60 * 60_000 }, // deletion attempts per user
  report: { limit: 10, windowMs: 60 * 60_000 },  // reports per user
  notice: { limit: 5, windowMs: 24 * 60 * 60_000 }, // notice-board posts per user per day
  noticeReply: { limit: 30, windowMs: 60 * 60_000 }, // notice-board replies per user
  question: { limit: 20, windowMs: 60 * 60_000 }, // new questions to GMs per user
  feedback: { limit: 5, windowMs: 60 * 60_000 }, // feedback messages per user (or IP when signed out)
  api: { limit: 120, windowMs: 60_000 },         // public JSON API requests per IP per minute
} as const;

export type Bucket = keyof typeof LIMITS;

/**
 * Client IP for rate limits. X-Forwarded-For is "client, proxy1, proxy2…" and anyone can put
 * anything on the left, so we count QUESTBOARD_PROXY_HOPS entries from the right (default 1:
 * one reverse proxy such as Caddy, nginx or Fly in front of the app). See clientIpFrom().
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return clientIpFrom(h.get("x-forwarded-for"), h.get("x-real-ip"), Number(process.env.QUESTBOARD_PROXY_HOPS ?? 1));
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
/** For API routes: a 429 response when this IP is over the API limit, otherwise null. */
export async function apiLimited(): Promise<Response | null> {
  if (hit("api", await clientIp())) return null;
  return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
}

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
