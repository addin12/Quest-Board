// The scheduler watches the app (scripts/scheduler.mjs): every minute it asks the app's /api/health. When
// the app hasn't answered for QUESTBOARD_DOWN_ALERT_MINUTES (default 10), the admins get one email straight
// from the email provider — the app itself can't send it while it's down — and another when it's back.
// It can't help when the whole server is down: that's what an outside uptime monitor is for (README).
import { DatabaseSync } from "node:sqlite";
import { configuredProviders, parseFrom } from "../src/lib/mail-providers.ts";
import { makeT } from "../src/lib/i18n/dict.ts";
import { formatMoment } from "../src/lib/time-zones.ts";

/**
 * One health check's effect. `state`: { downSince: number | null, alerted: boolean, detail: string }.
 * Returns the new state and what to send: "down" once after `thresholdMs` of failures, "up" when a
 * failure that was alerted about ends (short blips that never alerted send nothing).
 */
export function watchStep(state, healthy, now, thresholdMs, detail = "") {
  if (healthy) {
    const send = state.alerted ? "up" : null;
    return { state: { downSince: null, alerted: false, detail: "" }, send, downMs: state.downSince ? now - state.downSince : 0 };
  }
  const downSince = state.downSince ?? now;
  if (!state.alerted && now - downSince >= thresholdMs) return { state: { downSince, alerted: true, detail }, send: "down", downMs: now - downSince };
  return { state: { downSince, alerted: state.alerted, detail: detail || state.detail }, send: null, downMs: now - downSince };
}

/** Who to tell: the admins (from the database, if it can be read), else QUESTBOARD_CONTACT_EMAIL. */
export function recipients(env = process.env) {
  try {
    const db = new DatabaseSync(env.QUESTBOARD_DB ?? "data/questboard.db", { readOnly: true });
    const rows = db.prepare("SELECT email, name, locale, time_zone FROM users WHERE role = 'admin' AND email_verified_at IS NOT NULL AND deleted_at IS NULL AND suspended_at IS NULL").all();
    db.close();
    if (rows.length) return rows;
  } catch {
    // the database may be what's broken
  }
  return env.QUESTBOARD_CONTACT_EMAIL ? [{ email: env.QUESTBOARD_CONTACT_EMAIL, name: "", locale: "en", time_zone: "Asia/Jakarta" }] : [];
}

async function sendOne(env, to, subject, text) {
  const from = env.QUESTBOARD_MAIL_FROM ?? "";
  for (const p of configuredProviders(env)) {
    try {
      const res = p.id === "brevo"
        ? await fetch(`${p.url}/v3/smtp/email`, { method: "POST", headers: { "api-key": env.BREVO_API_KEY ?? "", "Content-Type": "application/json" }, body: JSON.stringify({ sender: parseFrom(from), to: [{ email: to }], subject, textContent: text }), signal: AbortSignal.timeout(10_000) })
        : await fetch(`${p.url}/emails`, { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY ?? ""}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, text }), signal: AbortSignal.timeout(10_000) });
      if (res.ok) return true;
    } catch {
      // try the next provider
    }
  }
  return false;
}

/** Email every recipient that the app is down (or back). Returns how many got it. */
export async function alertAdmins(kind, { since, minutes, detail }, env = process.env) {
  let sent = 0;
  for (const r of recipients(env)) {
    const lang = r.locale === "id" ? "id" : "en";
    const t = makeT(lang);
    const vars = { name: r.name || "admin", minutes, since: formatMoment(new Date(since), lang, r.time_zone), detail: detail || "-" };
    const ok = kind === "down"
      ? await sendOne(env, r.email, t("mail.appDownSubject"), t("mail.appDownBody", vars))
      : await sendOne(env, r.email, t("mail.appUpSubject"), t("mail.appUpBody", vars));
    if (ok) sent++;
  }
  return sent;
}
