import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { emailHtml } from "@/lib/email-html";
import { devOutboxEnabled } from "@/lib/mailer";
import { makeT, type Lang, type MsgKey } from "@/lib/i18n/dict";
import { formatMoment, formatWhen } from "@/lib/time-zones";

export const metadata: Metadata = { title: "Email gallery", robots: { index: false } };

/**
 * Development-only gallery of every email the app sends, filled with sample values, in English or
 * Indonesian (?lang=id) and in a reader's time zone (?tz=Asia/Makassar) — for reviewing wording and
 * layout without triggering each flow. Same gate as the dev outbox. Deliberately untranslated chrome.
 */
export default async function DevEmailsPage(props: PageProps<"/dev/emails">) {
  if (!devOutboxEnabled()) notFound();
  const sp = await props.searchParams;
  const lang: Lang = sp.lang === "id" ? "id" : "en";
  const tz = typeof sp.tz === "string" ? sp.tz : "Asia/Jakarta";
  const t = makeT(lang);
  const site = "https://questboard.id";
  const start = "2026-10-03T12:00:00.000Z";
  const when = formatWhen(start, lang, tz);
  const now = formatMoment(new Date("2026-09-29T07:05:00.000Z"), lang, tz);
  const base = { name: "Andi", title: "Mercusuar di Pulau Kabut", link: `${site}/games/mercusuar-di-pulau-kabut` };
  const mails: { id: string; about: string; subject: MsgKey; body: MsgKey; vars: Record<string, string | number> }[] = [
    { id: "verify", about: "Sign-up: confirm your email", subject: "mail.verifySubject", body: "mail.verifyBody", vars: { ...base, link: `${site}/verify-email?token=…` } },
    { id: "signup-attempt", about: "Someone signed up with an existing email", subject: "mail.signupAttemptSubject", body: "mail.signupAttemptBody", vars: { name: "Andi", when: now, login: `${site}/login`, reset: `${site}/forgot-password` } },
    { id: "reset", about: "Forgot password", subject: "mail.resetSubject", body: "mail.resetBody", vars: { name: "Andi", link: `${site}/reset-password?token=…` } },
    { id: "email-change", about: "Change login email: confirm the new address", subject: "mail.emailChangeSubject", body: "mail.emailChangeBody", vars: { name: "Andi", email: "andi.baru@gmail.com", link: `${site}/change-email?token=…` } },
    { id: "email-change-requested", about: "Change login email: notice to the old address", subject: "mail.emailChangeRequestedSubject", body: "mail.emailChangeRequestedBody", vars: { name: "Andi", email: "andi.baru@gmail.com", when: now, reset: `${site}/forgot-password` } },
    { id: "email-changed", about: "Change login email: done (to the old address)", subject: "mail.emailChangedSubject", body: "mail.emailChangedBody", vars: { name: "Andi", email: "andi.baru@gmail.com", when: now, help: `${site}/feedback` } },
    { id: "email-taken", about: "Change login email: the address already has an account", subject: "mail.emailTakenSubject", body: "mail.emailTakenBody", vars: { name: "Budi", when: now, login: `${site}/login` } },
    { id: "app-down", about: "Admins: the site is down (sent by the scheduler)", subject: "mail.appDownSubject", body: "mail.appDownBody", vars: { name: "Andi", minutes: 10, since: now, detail: "fetch failed: connect ECONNREFUSED" } },
    { id: "app-up", about: "Admins: the site is back", subject: "mail.appUpSubject", body: "mail.appUpBody", vars: { name: "Andi", minutes: 14, since: now } },
    { id: "password-changed", about: "Password changed", subject: "mail.passwordChangedSubject", body: "mail.passwordChangedBody", vars: { name: "Andi", when: now, link: `${site}/forgot-password` } },
    { id: "payment-changed", about: "GM payment details changed", subject: "mail.paymentChangedSubject", body: "mail.paymentChangedBody", vars: { name: "Dewi", when: now, details: "BCA 123-456-7890 a.n. Dewi Lestari", link: `${site}/forgot-password` } },
    { id: "two-step-on", about: "Two-step login turned on", subject: "mail.twoStepOnSubject", body: "mail.twoStepOnBody", vars: { name: "Andi", when: now, link: `${site}/forgot-password` } },
    { id: "two-step-off", about: "Two-step login turned off", subject: "mail.twoStepOffSubject", body: "mail.twoStepOffBody", vars: { name: "Andi", when: now, link: `${site}/forgot-password` } },
    { id: "new-device", about: "Login from a new device", subject: "mail.newDeviceSubject", body: "mail.newDeviceBody", vars: { name: "Andi", device: "Chrome · Android", when: now, reset: `${site}/forgot-password`, settings: `${site}/settings#devices` } },
    { id: "reminder-24h", about: "Session reminder, 24 hours (player)", subject: "mail.reminderSubject24", body: "mail.reminderBody", vars: { ...base, when, where: t("mail.reminderOnline"), n: 4 } },
    { id: "reminder-1h", about: "Session reminder, 1 hour (GM, in person)", subject: "mail.reminderSubject1", body: "mail.reminderBodyGm", vars: { ...base, when, where: t("mail.reminderInPerson", { city: "Bandung" }), n: 4 } },
    { id: "moved", about: "The GM moved a session", subject: "mail.movedSubject", body: "mail.movedBody", vars: { ...base, when: formatWhen("2026-10-03T13:00:00.000Z", lang, tz), before: when, hours: t("common.hours", { n: 3 }), link: `${site}/dashboard` } },
    { id: "cancelled", about: "The GM cancelled a session", subject: "mail.cancelSubject", body: "mail.cancelBody", vars: { ...base, when, reason: t("mail.cancelReason", { reason: "Saya sakit, maaf semuanya!" }) + "\n\n" } },
    { id: "seat-removed", about: "The GM released a player's seat", subject: "mail.seatRemovedSubject", body: "mail.seatRemovedBody", vars: { ...base, when, reason: t("mail.cancelReason", { reason: "Kursi ini dobel dipesan." }) + "\n\n", link: `${site}/games` } },
    { id: "notification", about: "A notification by email (can be turned off)", subject: "mail.notifBody", body: "mail.notifBody", vars: { name: "Dewi", text: "Andi booked a seat in Mercusuar di Pulau Kabut", link: `${site}/gm` } },
    { id: "gm-suspended", about: "Safety warning: a GM was suspended (always sent)", subject: "mail.gmSuspendedSubject", body: "mail.notifBodyImportant", vars: { name: "Andi", text: "Quest Board moderators suspended the GM Budi. Don't send them any money", link: `${site}/dashboard` } },
    {
      id: "digest", about: "Admin daily digest", subject: "mail.digestSubject", body: "mail.digestBody",
      vars: {
        name: "Admin", link: `${site}/admin/errors`,
        summary: [t("mail.digestErrorsCount", { n: 4 }), t("mail.digestEmailsCount", { n: 2 })].join(" · "),
        sections: [t("mail.digestErrors", { n: 4, lines: "• 3× TypeError: cannot read x (/games/[slug])\n• 1× SqliteError: disk I/O" }), t("mail.digestEmails", { n: 2, error: "Error: Resend 503: provider down" })].join("\n\n"),
      },
    },
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold">Email gallery</h1>
      <p className="mt-1 text-sm text-muted">Every email the app sends, with sample values. Times in {tz}.</p>
      <p className="mt-3 flex flex-wrap gap-3 text-sm">
        <Link href="/dev/emails?lang=en" aria-current={lang === "en" ? "page" : undefined} className="font-semibold text-accent hover:underline">English</Link>
        <Link href="/dev/emails?lang=id" aria-current={lang === "id" ? "page" : undefined} className="font-semibold text-accent hover:underline">Bahasa Indonesia</Link>
        <Link href={`/dev/emails?lang=${lang}&tz=Asia/Makassar`} className="text-accent hover:underline">WITA</Link>
        <Link href={`/dev/emails?lang=${lang}&tz=Asia/Jayapura`} className="text-accent hover:underline">WIT</Link>
      </p>
      <ul className="mt-6 space-y-4">
        {mails.map((m) => {
          const subject = m.subject === m.body ? String(m.vars.text).slice(0, 150) : t(m.subject, m.vars);
          const text = t(m.body, m.vars);
          return (
            <li key={m.id} className="card p-4" data-testid="gallery-mail" id={m.id}>
              <p className="text-xs uppercase tracking-wide text-muted">{m.about} · <code>{m.body}</code></p>
              <p className="mt-1 font-semibold" data-testid="gallery-subject">{subject}</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm" data-testid="gallery-body">{text}</pre>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-accent">HTML version</summary>
                <iframe title={`HTML version of “${subject}”`} sandbox="" srcDoc={emailHtml(subject, text)} className="mt-2 h-[28rem] w-full rounded border border-border bg-white" />
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
