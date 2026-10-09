// Emails about someone trying to get into an account (pure: no server imports, so node --test can load it).
import { makeT, type Lang } from "./i18n/dict.ts";
import { formatMoment } from "./time-zones.ts";
import type { Mail } from "./session-mail.ts";

/**
 * "Someone is trying to log in to your account": after repeated wrong passwords ("password"), or —
 * more serious — the right password but wrong two-step codes ("code"). Says what to do; never says
 * where the attempts came from (that would help nobody but the attacker).
 */
export function failedLoginsEmail(
  person: { email: string; name: string; locale: Lang; time_zone?: string },
  warning: { reason: "password" | "code"; attempts: number },
  origin: string,
  now = new Date(),
): Mail {
  const t = makeT(person.locale);
  const vars = { name: person.name, n: warning.attempts, when: formatMoment(now, person.locale, person.time_zone), reset: `${origin}/forgot-password`, devices: `${origin}/settings#devices` };
  return warning.reason === "code"
    ? { to: person.email, subject: t("mail.codeAttemptsSubject"), text: t("mail.codeAttemptsBody", vars) }
    : { to: person.email, subject: t("mail.failedLoginsSubject"), text: t("mail.failedLoginsBody", vars) };
}
