// Emails about a session (pure: no server imports, so node --test can load it).
import { makeT, type Lang } from "./i18n/dict.ts";
import { formatWhen } from "./time-zones.ts";
import { formatIdr } from "./policy.ts";

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

/**
 * "Your seat is booked" email for the player, right after reserving: when (in their time zone), where (the
 * venue and its map, or the platform), the price and where to see how to pay, the GM's refund terms and a
 * calendar file. The GM's payment details stay on the game page (they can change, and the page warns).
 */
export function bookingConfirmedEmail(
  person: { email: string; name: string; locale: Lang; time_zone?: string },
  s: {
    id: number; title: string; slug: string; system: string; starts_at: string; duration_minutes: number; price_idr: number; gm_name: string;
    location_type: string; platform: string; city: string; venue_name?: string; venue_maps_url?: string; gm_refund_terms?: string | null;
  },
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWhen(s.starts_at, person.locale, person.time_zone);
  const where = s.location_type === "online"
    ? t("mail.bookedOnline", { platform: s.platform || t("loc.online") })
    : s.venue_name
      ? `${s.venue_name}, ${s.city}` + (s.venue_maps_url ? `\n${t("mail.bookedMap", { link: s.venue_maps_url })}` : "")
      : t("mail.reminderInPerson", { city: s.city });
  return {
    to: person.email,
    subject: t("mail.bookedSubject", { title: s.title, when }),
    text: t("mail.bookedBody", {
      name: person.name, title: s.title, system: s.system, gm: s.gm_name, when, hours: t("common.hours", { n: s.duration_minutes / 60 }), where,
      price: s.price_idr === 0 ? t("common.free") : formatIdr(s.price_idr),
      link: `${origin}/games/${s.slug}`,
      refund: s.gm_refund_terms ? t("mail.bookedRefund", { terms: s.gm_refund_terms }) + "\n\n" : "",
      ics: `${origin}/api/sessions/${s.id}/ics`,
      mine: `${origin}/dashboard`,
    }),
  };
}

/**
 * "You cancelled your seat" email for the player, right after they cancel: what they cancelled, and for a
 * paid seat that refunds are arranged with the GM (Quest Board never holds the money), with the GM's terms.
 */
export function playerCancelledEmail(
  person: { email: string; name: string; locale: Lang; time_zone?: string },
  s: { title: string; slug: string; starts_at: string; gm_name: string; gm_refund_terms?: string | null },
  booking: { price_idr: number; paid: boolean },
  origin: string,
): Mail {
  const t = makeT(person.locale);
  const when = formatWhen(s.starts_at, person.locale, person.time_zone);
  const refund = booking.price_idr > 0
    ? t(booking.paid ? "mail.youCancelledPaid" : "mail.youCancelledMaybePaid", { gm: s.gm_name, price: formatIdr(booking.price_idr) }) + "\n\n"
      + (s.gm_refund_terms ? t("mail.bookedRefund", { terms: s.gm_refund_terms }) + "\n\n" : "")
    : "";
  return {
    to: person.email,
    subject: t("mail.youCancelledSubject", { title: s.title, when }),
    text: t("mail.youCancelledBody", { name: person.name, title: s.title, when, refund, link: `${origin}/games/${s.slug}`, games: `${origin}/games` }),
  };
}
