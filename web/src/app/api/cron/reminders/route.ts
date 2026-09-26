import { processReminders } from "@/lib/reminders";
import { siteOrigin } from "@/lib/site";
import { timingSafeEqual } from "node:crypto";

// Scheduler endpoint for session reminders. Call it every 5–10 minutes with
// "Authorization: Bearer $QUESTBOARD_CRON_SECRET". Without the secret configured the
// route doesn't exist (404); the site then falls back to checking while people browse.
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.QUESTBOARD_CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function run(request: Request) {
  if (!process.env.QUESTBOARD_CRON_SECRET) return new Response("Not found", { status: 404 });
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const emailed = await processReminders(await siteOrigin());
  return Response.json({ ok: true, emailed });
}

export const GET = run;
export const POST = run;
