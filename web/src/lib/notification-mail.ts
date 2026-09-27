import "server-only";
import { db } from "./db";
import { getNotificationRow } from "./notifications";
import { describeNotification } from "./notification-view";
import { makeT, type Lang } from "./i18n/dict";
import { sendEmail } from "./mailer";

// Emails for important notifications. notify() queues them inside the same transaction;
// this sends them afterwards: from the cron route, and at most every 10 s while people browse.

type Recipient = { email: string; name: string; locale: Lang; email_notifications: number; email_verified_at: string | null; deleted_at: string | null; suspended_at: string | null };

/** Send queued notification emails (oldest first). Returns how many went out. */
export async function deliverNotificationEmails(origin: string, limit = 50): Promise<number> {
  const queued = db().prepare("SELECT id, notification_id FROM email_queue ORDER BY id LIMIT ?").all(limit) as { id: number; notification_id: number }[];
  let sent = 0;
  for (const item of queued) {
    // Claim first, so two overlapping runs never send the same email twice.
    if (Number(db().prepare("DELETE FROM email_queue WHERE id = ?").run(item.id).changes) === 0) continue;
    const n = getNotificationRow(item.notification_id);
    if (!n || n.read_at) continue; // already seen in the app: no need to email
    const u = db().prepare("SELECT email, name, locale, email_notifications, email_verified_at, deleted_at, suspended_at FROM users WHERE id = ?").get(n.user_id) as Recipient | undefined;
    if (!u || !u.email_notifications || !u.email_verified_at || u.deleted_at || u.suspended_at) continue;
    const t = makeT(u.locale);
    const view = describeNotification(n, t);
    await sendEmail({
      to: u.email,
      subject: view.text.slice(0, 150),
      text: t("mail.notifBody", { name: u.name, text: view.text, link: origin + view.href }),
    });
    sent++;
  }
  return sent;
}

let lastRun = 0;

/** Fallback for when no scheduler calls the cron route: at most every 10 seconds. */
export function maybeDeliverNotificationEmails(origin: string): void {
  const now = Date.now();
  if (now - lastRun < 10_000) return;
  lastRun = now;
  deliverNotificationEmails(origin).catch((err) => console.error("[quest-board] notification emails failed", err));
}
