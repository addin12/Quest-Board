import "server-only";
import { db } from "./db";
import { emailHtml } from "./email-html";
import { configuredProviders, hasRoom, parseFrom, type ProviderId, type ProviderInfo } from "./mail-providers";

// Transactional email. Every message is written to `email_outbox` first (audit trail,
// and the dev outbox page reads it), then delivered through the first provider that has room
// (lib/mail-providers.ts: Resend, then Brevo; HTTP APIs, no SDK), as plain text plus the same text
// laid out as branded HTML (lib/email-html.ts). Delivery errors are recorded on the row and never
// break the user's request.
//
// Daily limits: each provider's emails of the last 24 hours are counted. Optional emails (notification
// emails and reminders) leave the last 20% of each limit to important ones (sign-up, password, security);
// when there's no room they wait (`deferred`) and the cron retries them until they expire.

/** `secret`: a one-time link inside `text` (reset/verify) that must not be stored readable.
 *  `headers`: extra email headers, e.g. List-Unsubscribe (lib/unsubscribe.ts).
 *  `optional`: can wait for room under the daily limit (notification emails, reminders).
 *  `expiresAt`: not worth sending after this (a reminder once its session has started). */
export type Email = { to: string; subject: string; text: string; secret?: string; headers?: Record<string, string>; optional?: boolean; expiresAt?: string };

const DAY = 86_400_000;

function post(p: ProviderInfo, mail: Email, from: string): Promise<Response> {
  const html = emailHtml(mail.subject, mail.text);
  const signal = AbortSignal.timeout(8_000);
  if (p.id === "brevo") {
    return fetch(`${p.url}/v3/smtp/email`, {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ sender: parseFrom(from), to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, htmlContent: html, ...(mail.headers ? { headers: mail.headers } : {}) }),
      signal,
    });
  }
  return fetch(`${p.url}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html, ...(mail.headers ? { headers: mail.headers } : {}) }),
    signal,
  });
}

/** Emails each provider accepted in the last 24 hours. */
export function sentLast24h(now = Date.now()): Record<ProviderId, number> {
  const rows = db()
    .prepare("SELECT provider, COUNT(*) AS n FROM email_outbox WHERE provider IS NOT NULL AND sent_at > ? GROUP BY provider")
    .all(new Date(now - DAY).toISOString()) as { provider: ProviderId; n: number }[];
  const out: Record<ProviderId, number> = { resend: 0, brevo: 0 };
  for (const r of rows) out[r.provider] = r.n;
  return out;
}

export async function sendEmail(mail: Email): Promise<void> {
  // The outbox is an audit trail, not a copy of live credentials: outside dev/e2e (where the
  // dev outbox page needs working links) the one-time link is blanked before it is stored.
  const redacted = !!mail.secret && !devOutboxEnabled();
  const stored = redacted ? mail.text.split(mail.secret!).join("[link removed]") : mail.text;
  const id = Number(
    db()
      .prepare("INSERT INTO email_outbox (to_address, subject, body_text, retryable, headers, optional, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(mail.to, mail.subject, stored, redacted ? 0 : 1, mail.headers ? JSON.stringify(mail.headers) : null, mail.optional ? 1 : 0, mail.expiresAt ?? null).lastInsertRowid,
  );
  await deliver(id, mail);
}

/** Send one outbox row through the first provider with room (no-op without one). Records the outcome. */
async function deliver(id: number, mail: Email): Promise<boolean> {
  const providers = configuredProviders(process.env);
  const from = process.env.QUESTBOARD_MAIL_FROM ?? "";
  if (providers.length === 0) return false; // queued only (development, or no provider configured yet)
  if (mail.expiresAt && Date.parse(mail.expiresAt) <= Date.now()) return false; // too late to be useful
  const used = sentLast24h();
  let lastError: string | null = null;
  for (const p of providers) {
    if (!hasRoom(p, used[p.id], !!mail.optional)) continue;
    try {
      const res = await post(p, mail, from);
      if (res.status === 429) continue; // the provider's own limit: try the next one; not a failure
      if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
      db()
        .prepare("UPDATE email_outbox SET sent_at = ?, error = NULL, deferred = 0, provider = ?, attempts = attempts + 1 WHERE id = ?")
        .run(new Date().toISOString(), p.id, id);
      return true;
    } catch (err) {
      lastError = String(err).slice(0, 500);
      console.error("[quest-board] email delivery failed", err);
    }
  }
  if (lastError) db().prepare("UPDATE email_outbox SET attempts = attempts + 1, error = ?, deferred = 0 WHERE id = ?").run(lastError, id);
  else db().prepare("UPDATE email_outbox SET deferred = 1 WHERE id = ?").run(id); // every provider at its limit: wait for room
  return false;
}

export const MAX_ATTEMPTS = 3;

/**
 * Retry emails that failed (provider outage, network) up to MAX_ATTEMPTS, and send the ones that waited
 * for room under the daily limit — within 24 hours and before they expire; important ones first.
 * Copies whose one-time link was blanked can't be resent — the person can ask for a new link.
 */
export async function retryFailedEmails(limit = 50): Promise<number> {
  const now = new Date();
  const rows = db()
    .prepare(
      `SELECT id, to_address, subject, body_text, headers, optional, expires_at FROM email_outbox
        WHERE sent_at IS NULL AND retryable = 1 AND created_at >= ? AND (expires_at IS NULL OR expires_at > ?)
          AND ((error IS NOT NULL AND attempts < ?) OR deferred = 1)
        ORDER BY optional, id LIMIT ?`,
    )
    .all(new Date(now.getTime() - DAY).toISOString(), now.toISOString(), MAX_ATTEMPTS, limit) as
    { id: number; to_address: string; subject: string; body_text: string; headers: string | null; optional: number; expires_at: string | null }[];
  let ok = 0;
  for (const r of rows) {
    const mail: Email = {
      to: r.to_address, subject: r.subject, text: r.body_text, optional: r.optional === 1,
      ...(r.headers ? { headers: JSON.parse(r.headers) } : {}), ...(r.expires_at ? { expiresAt: r.expires_at } : {}),
    };
    if (await deliver(r.id, mail)) ok++;
  }
  return ok;
}

/** Housekeeping (from the cron route): drop outbox rows older than `days`. */
export function pruneOutbox(days = 30): number {
  const cutoff = new Date(Date.now() - days * DAY).toISOString();
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
