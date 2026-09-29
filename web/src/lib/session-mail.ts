// Emails about a session (pure: no server imports, so node --test can load it).
import { makeT, type Lang } from "./i18n/dict.ts";
import { formatWhen } from "./time-zones.ts";

export type Mail = { to: string; subject: string; text: string };

/** "The GM released your seat" email for one removed player, with the GM's message if any. */
export function seatRemovedEmail(
  person: { email: string; name: string; locale: Lang; time_zone?: string },
  s: { title: string; starts_at: string },
  reason: string,
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWhen(s.starts_at, person.locale, person.time_zone);
  return {
    to: person.email,
    subject: t("mail.seatRemovedSubject", { title: s.title, when }),
    text: t("mail.seatRemovedBody", { name: person.name, title: s.title, when, reason: reason ? t("mail.cancelReason", { reason }) + "\n\n" : "", link: `${origin}/games` }),
  };
}

/** "The GM moved your session" email for a booked player: old and new time, and how to cancel if it no longer works. */
export function movedEmail(
  person: { email: string; name: string; locale: Lang; time_zone?: string },
  s: { title: string; slug: string },
  from: { starts_at: string },
  to: { starts_at: string; duration_minutes: number },
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWhen(to.starts_at, person.locale, person.time_zone);
  return {
    to: person.email,
    subject: t("mail.movedSubject", { title: s.title, when }),
    text: t("mail.movedBody", {
      name: person.name, title: s.title, before: formatWhen(from.starts_at, person.locale, person.time_zone), when,
      hours: t("common.hours", { n: to.duration_minutes / 60 }), link: `${origin}/dashboard`,
    }),
  };
}

/** "The GM cancelled…" email for a booked player, in their language, with the GM's message if any. */
export function cancellationEmail(
  person: { email: string; name: string; locale: Lang; time_zone?: string },
  s: { title: string; slug: string; starts_at: string; archived?: boolean },
  reason: string,
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWhen(s.starts_at, person.locale, person.time_zone);
  const reasonBlock = reason ? t("mail.cancelReason", { reason }) + "\n\n" : "";
  return {
    to: person.email,
    subject: t("mail.cancelSubject", { title: s.title, when }),
    text: t("mail.cancelBody", { name: person.name, title: s.title, when, reason: reasonBlock, link: s.archived ? `${origin}/games` : `${origin}/games/${s.slug}` }),
  };
}
