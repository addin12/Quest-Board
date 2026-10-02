// Turning a server error into a safe log row (pure, so node --test can load it).
// Never stores headers, cookies or query strings: they can hold session and reset tokens.

export type ErrorRow = { message: string; digest: string; method: string; path: string; route_path: string; route_type: string };

/** Next.js control-flow "errors" (redirect(), notFound()) are not failures. */
export function isControlFlow(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest);
}

/**
 * A path that's safe to log: no query string, and no secret path segment — an invite link's token,
 * a private calendar feed's token (both work as passwords for whoever has them).
 */
export function redactPath(path: string): string {
  return path
    .split("?")[0]
    .replace(/^\/invite\/[^/]+/, "/invite/…")
    .replace(/^\/api\/calendar\/[^/]+/, "/api/calendar/…")
    .slice(0, 300);
}

export function shapeError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string },
): ErrorRow {
  const message = (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 1000);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest).slice(0, 100) : "";
  return {
    message,
    digest,
    method: String(request.method ?? "").slice(0, 10),
    path: redactPath(String(request.path ?? "")),
    route_path: String(context.routePath ?? "").slice(0, 300),
    route_type: String(context.routeType ?? "").slice(0, 20),
  };
}
