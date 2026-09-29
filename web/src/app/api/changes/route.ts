import { getCurrentUser } from "@/lib/auth";
import { changeVersion, isWatchKind } from "@/lib/changes";

// GET /api/changes?kind=chat|notice|request|question&id=N → {"v":"…"}: the thread's change token,
// polled by open pages (components/auto-refresh.tsx) so they re-render only when something changed.
// Not counted against the public API limit: it's cheap, and members of one table may share a
// carrier IP. 404 when the thread isn't yours to watch.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const user = await getCurrentUser();
  const v = isWatchKind(kind) ? changeVersion(kind, Number(params.get("id")), user?.id ?? null, !!user?.admin) : null;
  if (v === null) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
