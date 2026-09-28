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
import { timingSafeEqual } from "node:crypto";

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
  purgeExpiredSessions();
  purgeOldWindows();
  const pruned = { notifications: pruneNotifications(), outbox: pruneOutbox(), errors: pruneErrorLog(), uploads: pruneOrphanUploads() };
  return Response.json({ ok: true, emailed, notificationEmails, retried, reviewPrompts, noticeReminders, waitlists, pruned });
}

export const GET = run;
export const POST = run;
