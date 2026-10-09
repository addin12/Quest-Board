// The sign-in cookie's settings, shared by lib/auth.ts (sign in) and src/proxy.ts (keeps it alive).
// Pure: the proxy can't import server-only modules.

export const SESSION_COOKIE = "qb_session";
/** A session lasts this long after the last visit (sliding: each visit renews it). */
export const SESSION_DAYS = 30;
/** A session ends this long after the login however active it is: then the person logs in again. */
export const SESSION_MAX_DAYS = 90;

/** HTTPS-only cookies in production. QUESTBOARD_INSECURE_COOKIES is for the e2e servers only (production builds
 * on http://localhost, where WebKit — unlike Chromium and Firefox — drops Secure cookies). Never set it live. */
export const secureCookies = () => process.env.NODE_ENV === "production" && process.env.QUESTBOARD_INSECURE_COOKIES !== "true";

export const sessionCookieOptions = (expires: Date) =>
  ({ httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", expires }) as const;
