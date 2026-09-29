import "server-only";
import { db } from "./db";
import { sendEmail } from "./mailer";
import { makeT, type Lang } from "./i18n/dict";

// Admins hear about server errors without having to look: at most once a day, and only when there
// were any, each admin gets a short summary (most frequent first) linking to /admin/errors.

const KEY = "error_digest_at";
const MIN_GAP_MS = 20 * 3_600_000; // "daily", with slack for a cron that drifts

export async function sendErrorDigest(origin: string, now = new Date()): Promise<number> {
  const last = (db().prepare("SELECT value FROM app_state WHERE key = ?").get(KEY) as { value: string } | undefined)?.value;
  if (last && now.getTime() - Date.parse(last) < MIN_GAP_MS) return 0;
  const since = last ?? new Date(now.getTime() - 86_400_000).toISOString();
  const groups = db()
    .prepare(
      `SELECT message, route_path, COUNT(*) AS n FROM error_log WHERE created_at > ? AND created_at <= ?
        GROUP BY message, route_path ORDER BY n DESC, MAX(created_at) DESC LIMIT 8`,
    )
    .all(since, now.toISOString()) as { message: string; route_path: string; n: number }[];
  const total = (db().prepare("SELECT COUNT(*) AS n FROM error_log WHERE created_at > ? AND created_at <= ?").get(since, now.toISOString()) as { n: number }).n;
  if (total === 0) return 0;
  const admins = db()
    .prepare("SELECT email, name, locale FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL AND deleted_at IS NULL AND suspended_at IS NULL")
    .all() as { email: string; name: string; locale: Lang }[];
  for (const a of admins) {
    const t = makeT(a.locale);
    const lines = groups.map((g) => `• ${g.n}× ${g.message.slice(0, 160)}${g.route_path ? ` (${g.route_path})` : ""}`).join("\n");
    await sendEmail({
      to: a.email,
      subject: t("mail.errorDigestSubject", { n: total }),
      text: t("mail.errorDigestBody", { name: a.name, n: total, lines, link: `${origin}/admin/errors` }),
    });
  }
  db().prepare("INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(KEY, now.toISOString(), now.toISOString());
  return admins.length;
}
