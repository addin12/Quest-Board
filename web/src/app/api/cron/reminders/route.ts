import { processReminders } from "@/lib/reminders";
import { refreshAllWaitlists } from "@/lib/waitlist";
import { pruneNotifications } from "@/lib/notifications";
import { pruneOutbox, retryFailedEmails } from "@/lib/mailer";
import { promptReviews } from "@/lib/review-prompts";
import { purgeExpiredSessions } from "@/lib/auth";
import { purgeOldWindows } from "@/lib/rate-limit";
import { pruneErrorLog } from "@/lib/error-log";
import { deliverNotificationEmails } from "@/lib/notification-mail";
import { siteOrigin } from "@/lib/site";
import { remindExpiringNotices } from "@/lib/community";
import { pruneOrphanUploads } from "@/lib/uploads";
import { pruneSecurityRecords } from "@/lib/retention";
import { sendErrorDigest } from "@/lib/error-digest";
import { sendOpeningEmails } from "@/lib/prelaunch";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

// Scheduler endpoint: session reminders, expired waitlist offers passed on to the next person,
// notification emails (and retries of failed ones), review prompts, "your notice comes down soon", and housekeeping (old read
// notifications, outbox rows, error log, expired sign-in sessions and rate-limit windows, unused pictures). Call it every 5–10 minutes with
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
  const waitlists = refreshAllWaitlists();
  const origin = await siteOrigin();
  const emailed = await processReminders(origin);
  const reviewPrompts = promptReviews();
  const noticeReminders = remindExpiringNotices();
  const notificationEmails = await deliverNotificationEmails(origin, 500);
  const retried = await retryFailedEmails();
  const errorDigest = await sendErrorDigest(origin); // at most daily, only when there were errors
  const openingEmails = await sendOpeningEmails(origin); // once Quest Board has opened (pre-launch list)
  purgeExpiredSessions();
  purgeOldWindows();
  const pruned = { notifications: pruneNotifications(), outbox: pruneOutbox(), errors: pruneErrorLog(), uploads: pruneOrphanUploads(), ...pruneSecurityRecords() };
  // For /api/health?full=1: an uptime monitor notices when the cron stops.
  const now = new Date().toISOString();
  db().prepare("INSERT INTO app_state (key, value, updated_at) VALUES ('cron_last_run', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(now, now);
  return Response.json({ ok: true, emailed, notificationEmails, retried, reviewPrompts, noticeReminders, errorDigest, openingEmails, waitlists, pruned });
}

export const GET = run;
export const POST = run;
