import "server-only";
import { db, tx } from "./db";
import { notify } from "./notifications";
import { sendEmail, type Email } from "./mailer";
import { makeT, type Lang } from "./i18n/dict";
import { planReminders, type ReminderCandidate } from "./reminder-plan";
import { formatWhen } from "./time-zones";
import { unsubscribeHeaders } from "./unsubscribe";

// Session reminders (P2-12): an in-app notification plus an email in the person's language,
// 24 hours and 1 hour before each session. Triggered by /api/cron/reminders (production
// scheduler) and, as a fallback, at most once a minute while people use the site.

type Recipient = { name: string; email: string; locale: Lang; time_zone: string; email_reminders: number; email_verified_at: string | null };
type SessionInfo = { title: string; slug: string; location_type: "online" | "in_person"; city: string; table_link: string; starts_at: string; booked: number };

/** Send every reminder that is due. Returns how many went out. Safe to call concurrently. */
export async function processReminders(origin: string, now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 3_600_000).toISOString();
  const nowIso = now.toISOString();
  const live = "s.status = 'scheduled' AND s.starts_at > ? AND s.starts_at <= ? AND g.status = 'published'";
  const sentFor = "(SELECT GROUP_CONCAT(kind) FROM session_reminders r WHERE r.session_id = s.id AND r.user_id = u.id)";
  const person = "u.deleted_at IS NULL AND u.suspended_at IS NULL";
  const rows = db()
    .prepare(
      `SELECT s.id AS session_id, u.id AS user_id, 'player' AS role, s.starts_at, b.created_at AS booked_at, ${sentFor} AS sent
         FROM game_sessions s JOIN games g ON g.id = s.game_id
         JOIN bookings b ON b.session_id = s.id AND b.status = 'confirmed' JOIN users u ON u.id = b.player_id
        WHERE ${live} AND ${person}
       UNION ALL
       SELECT s.id, u.id, 'gm', s.starts_at, NULL, ${sentFor}
         FROM game_sessions s JOIN games g ON g.id = s.game_id JOIN users u ON u.id = g.gm_id
        WHERE ${live} AND ${person}
          AND EXISTS (SELECT 1 FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed')`,
    )
    .all(nowIso, horizon, nowIso, horizon) as (Omit<ReminderCandidate, "sent"> & { sent: string | null })[];
  const due = planReminders(rows.map((r) => ({ ...r, sent: (r.sent?.split(",") ?? []) as ReminderCandidate["sent"] })), now);
  if (due.length === 0) return 0;

  const emails: Email[] = [];
  tx((c) => {
    const claim = c.prepare("INSERT OR IGNORE INTO session_reminders (session_id, user_id, kind) VALUES (?, ?, ?)");
    const who = c.prepare("SELECT name, email, locale, time_zone, email_reminders, email_verified_at FROM users WHERE id = ?");
    const session = c.prepare(
      `SELECT g.title, g.slug, g.location_type, g.city, g.table_link, s.starts_at,
              (SELECT COUNT(*) FROM bookings b WHERE b.session_id = s.id AND b.status = 'confirmed') AS booked
         FROM game_sessions s JOIN games g ON g.id = s.game_id WHERE s.id = ?`,
    );
    for (const d of due) {
      if (Number(claim.run(d.session_id, d.user_id, d.kind).changes) === 0) continue; // another run got it
      const isGm = rows.some((r) => r.session_id === d.session_id && r.user_id === d.user_id && r.role === "gm");
      notify({ userId: d.user_id, kind: d.kind === "24h" ? "session_reminder_24h" : "session_reminder_1h", sessionId: d.session_id }, c);
      const u = who.get(d.user_id) as Recipient;
      if (!u.email_reminders || !u.email_verified_at) continue;
      const s = session.get(d.session_id) as SessionInfo;
      emails.push(reminderEmail(u, d.user_id, s, d.kind, isGm, origin));
    }
  });
  for (const e of emails) await sendEmail(e);
  return emails.length;
}

function reminderEmail(u: Recipient, userId: number, s: SessionInfo, kind: "24h" | "1h", isGm: boolean, origin: string): Email {
  const t = makeT(u.locale);
  const when = formatWhen(s.starts_at, u.locale, u.time_zone);
  const where = s.location_type === "online"
    ? (s.table_link ? t("mail.reminderOnlineLink", { link: s.table_link }) : t("mail.reminderOnline"))
    : t("mail.reminderInPerson", { city: s.city });
  const vars = { name: u.name, title: s.title, when, where, link: `${origin}/games/${s.slug}`, n: s.booked };
  return {
    to: u.email,
    subject: t(kind === "24h" ? "mail.reminderSubject24" : "mail.reminderSubject1", vars),
    text: t(isGm ? "mail.reminderBodyGm" : "mail.reminderBody", vars),
    headers: unsubscribeHeaders(origin, userId, "reminders"),
    optional: true, // may wait for room under the daily limit, but never past the start
    expiresAt: s.starts_at,
  };
}

let lastRun = 0;

/** Fallback trigger for when no scheduler calls the cron route: at most once a minute. */
export function maybeProcessReminders(origin: string): void {
  const now = Date.now();
  if (now - lastRun < 60_000) return;
  lastRun = now;
  processReminders(origin).catch((err) => console.error("[quest-board] reminders failed", err));
  import("./review-prompts").then((m) => m.promptReviews()).catch((err) => console.error("[quest-board] review prompts failed", err));
  import("./community").then((m) => m.remindExpiringNotices()).catch((err) => console.error("[quest-board] notice reminders failed", err));
}
