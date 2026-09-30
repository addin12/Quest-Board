// Content Security Policy, shared by next.config.ts (every response) and src/proxy.ts (pages).
// Pages get a fresh nonce per request: Next reads it from the request's CSP header and puts it on
// its own bootstrap scripts, and 'strict-dynamic' lets those load the rest — so no inline script
// runs unless the server wrote it (no 'unsafe-inline' for scripts). Everything else (API routes,
// files) runs no scripts at all. Dev additionally needs 'unsafe-eval' (React Refresh) and
// websockets (HMR). Styles stay 'unsafe-inline': React style attributes need it.
// Set QUESTBOARD_ENFORCE_HTTPS=true behind TLS to also upgrade insecure requests.

// Read at call time, so the proxy and the config agree (tests run both a dev and a production server).
const isDev = () => process.env.NODE_ENV === "development";

export function contentSecurityPolicy(nonce?: string): string {
  return [
    "default-src 'self'",
    nonce ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev() ? " 'unsafe-eval'" : ""}` : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev() ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.QUESTBOARD_ENFORCE_HTTPS === "true" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** HSTS behind TLS (QUESTBOARD_ENFORCE_HTTPS=true), read at request time — never at build time. */
export const hstsHeader = (): string | null =>
  process.env.QUESTBOARD_ENFORCE_HTTPS === "true" ? "max-age=31536000; includeSubDomains" : null;

/** A fresh per-request nonce (128 random bits, base64). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}
