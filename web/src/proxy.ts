import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, hstsHeader, newNonce } from "./lib/csp";
import { SESSION_COOKIE, SESSION_DAYS, sessionCookieOptions } from "./lib/session-cookie";

// Language URLs (P3-3): /id/... and /en/... serve the same pages in that language, so each
// language has its own indexable address. The prefix is stripped by a rewrite (no route
// duplication, ADR-7), the language travels to the app in a request header, and visiting
// a prefixed URL also remembers that language (cookie) for the rest of the visit.
// Every page also gets its original path in `x-qb-path` (for hreflang/canonical tags), and a
// per-request script nonce in its Content-Security-Policy (lib/csp.ts). Page views also renew the
// sign-in cookie's expiry (sliding sessions; the database side is in lib/auth.ts getCurrentUser).

const PREFIX = /^\/(en|id)(?=\/|$)/;
const LANG_COOKIE = "qb_lang"; // same as LANG_COOKIE in lib/i18n/dict.ts (kept out of this bundle)

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete("x-qb-lang"); // only this proxy may set it
  headers.set("x-qb-path", pathname);
  const csp = contentSecurityPolicy(newNonce());
  headers.set("Content-Security-Policy", csp); // Next takes the nonce for its scripts from here
  const m = pathname.match(PREFIX);
  if (!m) return withCsp(NextResponse.next({ request: { headers } }), csp, request);

  const lang = m[1];
  headers.set("x-qb-lang", lang);
  const url = request.nextUrl.clone();
  url.pathname = pathname.slice(3) || "/";
  const res = NextResponse.rewrite(url, { request: { headers } });
  if (request.cookies.get(LANG_COOKIE)?.value !== lang) {
    res.cookies.set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return withCsp(res, csp, request);
}

function withCsp(res: NextResponse, csp: string, request?: NextRequest) {
  res.headers.set("Content-Security-Policy", csp);
  const hsts = hstsHeader(); // here, not in next.config: that one is fixed when the image is built
  if (hsts) res.headers.set("Strict-Transport-Security", hsts);
  return request ? renewSession(res, request) : res;
}

/**
 * Keep the sign-in cookie alive while it's used. Only on GET page views: a form post may be the one
 * that signs in or out, and must decide the cookie itself. An invalid token renewed here is harmless —
 * the server still checks it against the database.
 */
function renewSession(res: NextResponse, request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // Full page loads only: a background prefetch or data request still in flight when the cookie is
  // cleared (or replaced by a sign-in/out) must not put the old one back.
  const pageLoad = request.headers.get("sec-fetch-dest") === "document" || (!request.headers.has("rsc") && !request.headers.has("next-router-prefetch") && (request.headers.get("accept") ?? "").includes("text/html"));
  if (token && request.method === "GET" && pageLoad) res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(new Date(Date.now() + SESSION_DAYS * 86_400_000)));
  return res;
}

export const config = {
  // Pages only: skip Next internals, API routes and static files.
  matcher: ["/((?!_next/|api/|icons/|images/|favicon\.ico|manifest\.webmanifest|sitemap\.xml|robots\.txt|.*\.(?:svg|png|jpg|jpeg|webp|woff2?|ico|txt|xml)$).*)"],
};
