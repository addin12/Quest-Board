// Emails about a session (pure: no server imports, so node --test can load it).
import { makeT, type Lang } from "./i18n/dict.ts";
import { formatWib } from "./reminder-plan.ts";

export type Mail = { to: string; subject: string; text: string };

/** "The GM moved your session" email for a booked player: old and new time, and how to cancel if it no longer works. */
export function movedEmail(
  person: { email: string; name: string; locale: Lang },
  s: { title: string; slug: string },
  from: { starts_at: string },
  to: { starts_at: string; duration_minutes: number },
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWib(to.starts_at, person.locale);
  return {
    to: person.email,
    subject: t("mail.movedSubject", { title: s.title, when }),
    text: t("mail.movedBody", {
      name: person.name, title: s.title, before: formatWib(from.starts_at, person.locale), when,
      hours: t("common.hours", { n: to.duration_minutes / 60 }), link: `${origin}/dashboard`,
    }),
  };
}

/** "The GM cancelled…" email for a booked player, in their language, with the GM's message if any. */
export function cancellationEmail(
  person: { email: string; name: string; locale: Lang },
  s: { title: string; slug: string; starts_at: string; archived?: boolean },
  reason: string,
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWib(s.starts_at, person.locale);
  const reasonBlock = reason ? t("mail.cancelReason", { reason }) + "\n\n" : "";
  return {
    to: person.email,
    subject: t("mail.cancelSubject", { title: s.title, when }),
    text: t("mail.cancelBody", { name: person.name, title: s.title, when, reason: reasonBlock, link: s.archived ? `${origin}/games` : `${origin}/games/${s.slug}` }),
  };
}
