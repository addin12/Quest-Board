import { NextResponse, type NextRequest } from "next/server";

// Language URLs (P3-3): /id/... and /en/... serve the same pages in that language, so each
// language has its own indexable address. The prefix is stripped by a rewrite (no route
// duplication, ADR-7), the language travels to the app in a request header, and visiting
// a prefixed URL also remembers that language (cookie) for the rest of the visit.
// Every page also gets its original path in `x-qb-path` (for hreflang/canonical tags).

const PREFIX = /^\/(en|id)(?=\/|$)/;
const LANG_COOKIE = "qb_lang"; // same as LANG_COOKIE in lib/i18n/dict.ts (kept out of this bundle)

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.delete("x-qb-lang"); // only this proxy may set it
  headers.set("x-qb-path", pathname);
  const m = pathname.match(PREFIX);
  if (!m) return NextResponse.next({ request: { headers } });

  const lang = m[1];
  headers.set("x-qb-lang", lang);
  const url = request.nextUrl.clone();
  url.pathname = pathname.slice(3) || "/";
  const res = NextResponse.rewrite(url, { request: { headers } });
  if (request.cookies.get(LANG_COOKIE)?.value !== lang) {
    res.cookies.set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}

export const config = {
  // Pages only: skip Next internals, API routes and static files.
  matcher: ["/((?!_next/|api/|icons/|images/|favicon\.ico|manifest\.webmanifest|sitemap\.xml|robots\.txt|.*\.(?:svg|png|jpg|jpeg|webp|woff2?|ico|txt|xml)$).*)"],
};
