// Emails about a session (pure: no server imports, so node --test can load it).
import { makeT, type Lang } from "./i18n/dict.ts";
import { formatWib } from "./reminder-plan.ts";

export type Mail = { to: string; subject: string; text: string };

/** "The GM cancelled…" email for a booked player, in their language, with the GM's message if any. */
export function cancellationEmail(
  person: { email: string; name: string; locale: Lang },
  s: { title: string; slug: string; starts_at: string },
  reason: string,
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWib(s.starts_at, person.locale);
  const reasonBlock = reason ? t("mail.cancelReason", { reason }) + "\n\n" : "";
  return {
    to: person.email,
    subject: t("mail.cancelSubject", { title: s.title, when }),
    text: t("mail.cancelBody", { name: person.name, title: s.title, when, reason: reasonBlock, link: `${origin}/games/${s.slug}` }),
  };
}
