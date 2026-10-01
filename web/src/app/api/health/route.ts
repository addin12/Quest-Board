import { db } from "@/lib/db";
import { SCHEMA_VERSION } from "@/lib/schema";
import { configuredProviders } from "@/lib/mail-providers";

// GET /api/health — for container health checks: 200 when the database answers at the expected
// schema version, 503 otherwise. GET /api/health?full=1 — for an uptime monitor (e.g. UptimeRobot):
// also 503 when the scheduled cron hasn't run for CRON_STALE_MINUTES (reminders and emails stop)
// or emails have been stuck unsent for EMAIL_STUCK_MINUTES while a provider is configured.
// (Liveness stays database-only: restarting the app wouldn't fix a stopped cron.) Reveals nothing private.
export const dynamic = "force-dynamic";

const CRON_STALE_MINUTES = 30;
const EMAIL_STUCK_MINUTES = 30;
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    const { user_version } = db().prepare("PRAGMA user_version").get() as { user_version: number };
    db().prepare("SELECT 1 FROM users LIMIT 1").get();
    const dbOk = user_version === SCHEMA_VERSION;
    if (new URL(request.url).searchParams.get("full") !== "1") {
      return Response.json({ ok: dbOk, schema: user_version }, { status: dbOk ? 200 : 503, headers: noStore });
    }

    const now = Date.now();
    // The cron route records each run; without QUESTBOARD_CRON_SECRET there is no cron to watch
    // (the site then does the work while people browse).
    const cronConfigured = !!process.env.QUESTBOARD_CRON_SECRET;
    const lastRun = (db().prepare("SELECT value FROM app_state WHERE key = 'cron_last_run'").get() as { value: string } | undefined)?.value ?? null;
    const cronOk = !cronConfigured || (!!lastRun && now - Date.parse(lastRun) < CRON_STALE_MINUTES * 60_000);

    // Emails still unsent after a while, within the 24-hour retry window, when a provider is set.
    // Optional emails waiting for room under the daily limit aren't stuck; important ones are.
    const providerConfigured = configuredProviders(process.env).length > 0;
    const stuck = providerConfigured
      ? (db()
          .prepare("SELECT COUNT(*) AS n FROM email_outbox WHERE sent_at IS NULL AND NOT (deferred = 1 AND optional = 1) AND created_at < ? AND created_at > ?")
          .get(new Date(now - EMAIL_STUCK_MINUTES * 60_000).toISOString(), new Date(now - 86_400_000).toISOString()) as { n: number }).n
      : 0;
    const emailOk = stuck === 0;

    const ok = dbOk && cronOk && emailOk;
    return Response.json(
      {
        ok, schema: user_version,
        cron: cronConfigured ? { ok: cronOk, lastRun } : "not configured",
        email: providerConfigured ? { ok: emailOk, stuck } : "not configured",
      },
      { status: ok ? 200 : 503, headers: noStore },
    );
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: noStore });
  }
}
