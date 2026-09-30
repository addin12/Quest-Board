import "server-only";
import { db } from "./db";
import { sendEmail } from "./mailer";
import { makeT, type Lang } from "./i18n/dict";
import { devOutboxEnabled } from "./mailer";
import { currentSetupChecks } from "./setup-facts";
import type { SetupCheck } from "./setup-check";

// Admins hear about problems without having to look: at most once a day, and only when there were
// any, each admin gets a short summary — server errors (most frequent first, linking to
// /admin/errors), emails the provider couldn't deliver (a broken email setup is otherwise silent),
// and on a real server the setup check's "Fix" items — a stopped backup or off-site copy, a full disk…

const KEY = "error_digest_at";
const MIN_GAP_MS = 20 * 3_600_000; // "daily", with slack for a cron that drifts

/** The setup check's "Fix" items — only on a real server (the dev and e2e servers always have some). */
function setupProblemsNow(): SetupCheck[] {
  if (process.env.NODE_ENV !== "production" || devOutboxEnabled()) return [];
  return currentSetupChecks().filter((c) => c.level === "danger");
}

export async function sendErrorDigest(origin: string, now = new Date(), setupProblems: SetupCheck[] = setupProblemsNow()): Promise<number> {
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
  const failed = db()
    .prepare(
      `SELECT COUNT(*) AS n, (SELECT error FROM email_outbox WHERE sent_at IS NULL AND error IS NOT NULL AND created_at > ? AND created_at <= ? ORDER BY id DESC LIMIT 1) AS last_error
         FROM email_outbox WHERE sent_at IS NULL AND error IS NOT NULL AND created_at > ? AND created_at <= ?`,
    )
    .get(since, now.toISOString(), since, now.toISOString()) as { n: number; last_error: string | null };
  if (total === 0 && failed.n === 0 && setupProblems.length === 0) return 0;
  const admins = db()
    .prepare("SELECT email, name, locale FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL AND deleted_at IS NULL AND suspended_at IS NULL")
    .all() as { email: string; name: string; locale: Lang }[];
  const lines = groups.map((g) => `• ${g.n}× ${g.message.slice(0, 160)}${g.route_path ? ` (${g.route_path})` : ""}`).join("\n");
  for (const a of admins) {
    const t = makeT(a.locale);
    const summary: string[] = [];
    const sections: string[] = [];
    if (total > 0) {
      summary.push(t("mail.digestErrorsCount", { n: total }));
      sections.push(t("mail.digestErrors", { n: total, lines }));
    }
    if (failed.n > 0) {
      summary.push(t("mail.digestEmailsCount", { n: failed.n }));
      sections.push(t("mail.digestEmails", { n: failed.n, error: (failed.last_error ?? "").slice(0, 160) }));
    }
    if (setupProblems.length > 0) {
      summary.push(t("mail.digestSetupCount", { n: setupProblems.length }));
      const lines = setupProblems.map((c) => `• ${t(c.title)}: ${t(c.detail, c.vars)}`).join("\n");
      sections.push(t("mail.digestSetup", { n: setupProblems.length, lines, link: `${origin}/admin/setup` }));
    }
    await sendEmail({
      to: a.email,
      subject: t("mail.digestSubject", { summary: summary.join(" · ") }),
      text: t("mail.digestBody", { name: a.name, sections: sections.join("\n\n"), link: `${origin}/admin/errors` }),
    });
  }
  db().prepare("INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(KEY, now.toISOString(), now.toISOString());
  return admins.length;
}
