import { getCurrentUser } from "@/lib/auth";
import { changeVersion, isWatchKind } from "@/lib/changes";
import { clientIp, hit } from "@/lib/rate-limit";

// GET /api/changes?kind=chat|notice|request|question&id=N → {"v":"…"}: the thread's change token,
// polled by open pages (components/auto-refresh.tsx) so they re-render only when something changed.
// Its own, generous per-IP limit (LIMITS.changes) rather than the public API's: it's cheap, and many
// members may share one carrier IP. 404 when the thread isn't yours to watch.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hit("changes", await clientIp())) return Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const user = await getCurrentUser();
  const v = isWatchKind(kind) ? changeVersion(kind, Number(params.get("id")), user?.id ?? null, !!user?.admin) : null;
  if (v === null) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
