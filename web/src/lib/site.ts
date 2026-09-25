import "server-only";
import { headers } from "next/headers";

let warned = false;

/**
 * Absolute origin for links that leave the site (share links, calendar files, OG tags).
 * Set QUESTBOARD_BASE_URL in production (e.g. https://questboard.id); otherwise the
 * request's host is used, which is right for local development.
 */
export async function siteOrigin(): Promise<string> {
  const env = process.env.QUESTBOARD_BASE_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("[quest-board] QUESTBOARD_BASE_URL is not set; share/calendar/OG links use the request Host header. Set it in production.");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

