// Pure: delivery events from the email providers (bounces and spam complaints), for
// /api/email-events/resend and /api/email-events/brevo. Free plans are suspended when too many emails
// go to dead addresses or are marked as spam, so those addresses stop getting optional emails
// (lib/email-suppression.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

export type SuppressReason = "bounce" | "complaint";
export type EmailEvent = { emails: string[]; reason: SuppressReason; detail: string };

const sameBytes = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Resend signs its webhooks with Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<body>" with the
 * endpoint's secret ("whsec_<base64>"), base64, in svix-signature as "v1,<sig>" (several, space-separated).
 * Older than 5 minutes (or from the future) is refused, so a captured request can't be replayed later.
 */
export function svixSignatureOk(secret: string, h: { id: string | null; timestamp: string | null; signature: string | null }, body: string, now = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${body}`).digest("base64");
  return h.signature.split(" ").some((part) => part.startsWith("v1,") && sameBytes(part.slice(3), expected));
}

/** The token in Brevo's webhook URL (?token=…), compared in constant time. */
export const brevoTokenOk = (expected: string | undefined, got: string | null) => !!expected && !!got && sameBytes(expected, got);

const addresses = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string" && x.includes("@")).map((x) => x.trim().toLowerCase());

/** Resend: email.bounced (the receiving server refused it for good) and email.complained (marked as spam). */
export function resendEvent(payload: unknown): EmailEvent | null {
  const p = payload as { type?: string; data?: { to?: unknown; bounce?: { message?: string; type?: string } } } | null;
  const reason: SuppressReason | null = p?.type === "email.bounced" ? "bounce" : p?.type === "email.complained" ? "complaint" : null;
  if (!reason) return null;
  if (reason === "bounce" && p?.data?.bounce?.type && /transient|temporary|soft/i.test(p.data.bounce.type)) return null; // will be retried by the provider
  const emails = addresses(p?.data?.to);
  return emails.length ? { emails, reason, detail: String(p?.data?.bounce?.message ?? p?.type ?? "").slice(0, 200) } : null;
}

/** Brevo: hard_bounce, invalid_email and blocked mean the address can't get mail; spam is a complaint. Soft bounces are retried by Brevo. */
export function brevoEvent(payload: unknown): EmailEvent | null {
  const p = payload as { event?: string; email?: unknown; reason?: string } | null;
  const reason: SuppressReason | null = ["hard_bounce", "invalid_email", "blocked"].includes(p?.event ?? "") ? "bounce" : p?.event === "spam" ? "complaint" : null;
  if (!reason) return null;
  const emails = addresses(p?.email);
  return emails.length ? { emails, reason, detail: String(p?.reason ?? p?.event ?? "").slice(0, 200) } : null;
}
