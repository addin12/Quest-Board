import "server-only";
import { db } from "./db";
import type { EmailEvent } from "./email-events";

// Addresses that bounced for good or marked our email as spam (lib/email-events.ts). They get no optional
// emails (notification emails, reminders) until the person confirms the address again or presses
// "Try again" in Settings; important ones (sign-up, password, security) still go — they're few, and needed.

export type Suppression = { reason: "bounce" | "complaint"; provider: string; created_at: string };

export function recordEmailEvent(e: EmailEvent, provider: "resend" | "brevo"): number {
  const put = db().prepare(
    `INSERT INTO email_suppressions (email, reason, provider, detail) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET reason = CASE WHEN excluded.reason = 'complaint' THEN 'complaint' ELSE email_suppressions.reason END,
                                        provider = excluded.provider, detail = excluded.detail`,
  );
  for (const email of e.emails) put.run(email, e.reason, provider, e.detail);
  return e.emails.length;
}

export function suppressionFor(email: string): Suppression | null {
  return (db().prepare("SELECT reason, provider, created_at FROM email_suppressions WHERE email = ?").get(email.trim().toLowerCase()) as Suppression | undefined) ?? null;
}

export const isSuppressed = (email: string) => suppressionFor(email) !== null;

/** The address works again (confirmed from a link sent to it, or the person asked to try again). */
export function clearSuppression(email: string) {
  db().prepare("DELETE FROM email_suppressions WHERE email = ?").run(email.trim().toLowerCase());
}

/** New suppressions in a period, for the admin summary. */
export function countSuppressions(since: string, until: string): { bounces: number; complaints: number } {
  const row = db()
    .prepare("SELECT SUM(reason = 'bounce') AS bounces, SUM(reason = 'complaint') AS complaints FROM email_suppressions WHERE created_at > ? AND created_at <= ?")
    .get(since, until) as { bounces: number | null; complaints: number | null };
  return { bounces: row.bounces ?? 0, complaints: row.complaints ?? 0 };
}
