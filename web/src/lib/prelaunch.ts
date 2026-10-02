import "server-only";
import { db } from "./db";
import { sendEmail } from "./mailer";
import { makeT, type Lang } from "./i18n/dict";
import { logAdminAction } from "./moderation";

// "GMs first" pre-launch mode (admin home): GMs sign up and list games while players can't book yet;
// visitors can leave their email (/opening) to be told once when it opens. Turning it off sends that
// one email to everyone on the list (from the cron, within the daily email limits) and deletes them.

const KEY = "prelaunch";

export function isPrelaunch(): boolean {
  return (db().prepare("SELECT value FROM app_state WHERE key = ?").get(KEY) as { value: string } | undefined)?.value === "1";
}

export function setPrelaunch(on: boolean, adminId: number) {
  const now = new Date().toISOString();
  db()
    .prepare("INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(KEY, on ? "1" : "0", now);
  logAdminAction(adminId, on ? "prelaunch_on" : "prelaunch_off", null);
}

export function addLaunchNotify(email: string, lang: Lang) {
  db().prepare("INSERT OR IGNORE INTO launch_notify (email, lang) VALUES (?, ?)").run(email.trim().toLowerCase(), lang);
}

export const launchNotifyCount = () => (db().prepare("SELECT COUNT(*) AS n FROM launch_notify").get() as { n: number }).n;

/** Once open: the "we're open" email to the next people on the list, then their address is deleted. */
export async function sendOpeningEmails(origin: string, limit = 50): Promise<number> {
  if (isPrelaunch()) return 0;
  const rows = db().prepare("SELECT email, lang FROM launch_notify ORDER BY created_at LIMIT ?").all(limit) as { email: string; lang: Lang }[];
  for (const r of rows) {
    // Claim first, so two overlapping runs never send it twice.
    if (Number(db().prepare("DELETE FROM launch_notify WHERE email = ?").run(r.email).changes) === 0) continue;
    const t = makeT(r.lang);
    // Optional: it waits for room under the daily limit (a long list goes out over the day), for a week.
    await sendEmail({ to: r.email, subject: t("mail.openingSubject"), text: t("mail.openingBody", { link: `${origin}/games` }), optional: true, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() });
  }
  return rows.length;
}
