import { db } from "@/lib/db";
import { SCHEMA_VERSION } from "@/lib/schema";

// GET /api/health — for uptime monitors and container health checks. 200 when the database
// answers at the expected schema version, 503 otherwise. Reveals nothing private.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user_version } = db().prepare("PRAGMA user_version").get() as { user_version: number };
    db().prepare("SELECT 1 FROM users LIMIT 1").get();
    const ok = user_version === SCHEMA_VERSION;
    return Response.json({ ok, schema: user_version }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
