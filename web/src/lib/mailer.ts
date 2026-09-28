import "server-only";
import { db } from "./db";
import { emailHtml } from "./email-html";

// Transactional email. Every message is written to `email_outbox` first (audit trail,
// and the dev outbox page reads it). If RESEND_API_KEY + QUESTBOARD_MAIL_FROM are set,
// it is also delivered through Resend's HTTP API (no SDK dependency), as plain text plus the
// same text laid out as branded HTML (lib/email-html.ts). Delivery errors
// are recorded on the row and never break the user's request.

/** `secret`: a one-time link inside `text` (reset/verify) that must not be stored readable. */
export type Email = { to: string; subject: string; text: string; secret?: string };

export async function sendEmail(mail: Email): Promise<void> {
  // The outbox is an audit trail, not a copy of live credentials: outside dev/e2e (where the
  // dev outbox page needs working links) the one-time link is blanked before it is stored.
  const redacted = !!mail.secret && !devOutboxEnabled();
  const stored = redacted ? mail.text.split(mail.secret!).join("[link removed]") : mail.text;
  const id = Number(
    db().prepare("INSERT INTO email_outbox (to_address, subject, body_text, retryable) VALUES (?, ?, ?, ?)").run(mail.to, mail.subject, stored, redacted ? 0 : 1).lastInsertRowid,
  );
  await deliver(id, mail);
}

/** Send one outbox row through Resend (no-op without a provider). Records success or the error. */
async function deliver(id: number, mail: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.QUESTBOARD_MAIL_FROM;
  if (!key || !from) return false; // queued only (development, or no provider configured yet)
  db().prepare("UPDATE email_outbox SET attempts = attempts + 1 WHERE id = ?").run(id);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: emailHtml(mail.subject, mail.text) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    db().prepare("UPDATE email_outbox SET sent_at = ?, error = NULL WHERE id = ?").run(new Date().toISOString(), id);
    return true;
  } catch (err) {
    db().prepare("UPDATE email_outbox SET error = ? WHERE id = ?").run(String(err).slice(0, 500), id);
    console.error("[quest-board] email delivery failed", err);
    return false;
  }
}

export const MAX_ATTEMPTS = 3;

/**
 * Retry emails that failed (provider outage, network): up to MAX_ATTEMPTS within 24 hours.
 * Copies whose one-time link was blanked can't be resent — the person can ask for a new link.
 */
export async function retryFailedEmails(limit = 50): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const rows = db()
    .prepare(
      `SELECT id, to_address, subject, body_text FROM email_outbox
        WHERE sent_at IS NULL AND error IS NOT NULL AND retryable = 1 AND attempts < ? AND created_at >= ?
        ORDER BY id LIMIT ?`,
    )
    .all(MAX_ATTEMPTS, since, limit) as { id: number; to_address: string; subject: string; body_text: string }[];
  let ok = 0;
  for (const r of rows) if (await deliver(r.id, { to: r.to_address, subject: r.subject, text: r.body_text })) ok++;
  return ok;
}

/** Housekeeping (from the cron route): drop outbox rows older than `days`. */
export function pruneOutbox(days = 30): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return Number(db().prepare("DELETE FROM email_outbox WHERE created_at < ?").run(cutoff).changes);
}

/** The dev outbox page is on outside production, or when explicitly enabled (e2e). */
export function devOutboxEnabled(): boolean {
  // It shows live reset links, so it can never be switched on for a real HTTPS deployment.
  if (process.env.QUESTBOARD_ENFORCE_HTTPS === "true") return false;
  return process.env.NODE_ENV !== "production" || process.env.QUESTBOARD_DEV_OUTBOX === "true";
}

export function listOutbox(limit = 30) {
  return db()
    .prepare("SELECT id, to_address, subject, body_text, created_at, sent_at, error FROM email_outbox ORDER BY id DESC LIMIT ?")
    .all(limit) as { id: number; to_address: string; subject: string; body_text: string; created_at: string; sent_at: string | null; error: string | null }[];
}
