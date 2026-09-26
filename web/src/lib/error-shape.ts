// Turning a server error into a safe log row (pure, so node --test can load it).
// Never stores headers, cookies or query strings: they can hold session and reset tokens.

export type ErrorRow = { message: string; digest: string; method: string; path: string; route_path: string; route_type: string };

/** Next.js control-flow "errors" (redirect(), notFound()) are not failures. */
export function isControlFlow(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest);
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
    path: String(request.path ?? "").split("?")[0].slice(0, 300),
    route_path: String(context.routePath ?? "").slice(0, 300),
    route_type: String(context.routeType ?? "").slice(0, 20),
  };
}
