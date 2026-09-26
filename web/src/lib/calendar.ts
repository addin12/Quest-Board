// Pure calendar helpers: iCalendar (.ics, RFC 5545) and Google Calendar links.
import type { T } from "./i18n/dict";

export type CalendarEvent = {
  uid: string;          // stable, globally unique (e.g. "session-12@questboard")
  start: Date;
  minutes: number;
  title: string;
  description: string;
  location: string;
  url: string;
  cancelled?: boolean;  // STATUS:CANCELLED, so subscribed calendars mark or drop it
};

/** 2026-09-28T12:00:00.000Z → "20260928T120000Z" */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values: backslash, semicolon, comma, newline. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (UTF-8) with CRLF + space, never splitting a character. */
export function icsFold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(e: CalendarEvent, now = new Date()): string {
  return buildIcsFeed([e], null, now);
}

/**
 * A calendar with many events. `name` (X-WR-CALNAME) is set for subscribed feeds; calendar apps
 * re-fetch roughly every REFRESH-INTERVAL. Cancelled events keep their UID with STATUS:CANCELLED.
 */
export function buildIcsFeed(events: CalendarEvent[], name: string | null, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Quest Board//Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(name ? [`X-WR-CALNAME:${icsEscape(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"] : []),
    ...events.flatMap((e) => veventLines(e, now)),
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

function veventLines(e: CalendarEvent, now: Date): string[] {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  return [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    `LOCATION:${icsEscape(e.location)}`,
    `URL:${e.url}`,
    ...(e.cancelled
      ? ["STATUS:CANCELLED"]
      : ["STATUS:CONFIRMED", "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(e.title)}`, "END:VALARM"]),
    "END:VEVENT",
  ];
}

/** One Quest Board session as a calendar event (public details only — never payment info). */
export function sessionEvent(
  s: { id: number; starts_at: string; duration_minutes: number; title: string; system: string; slug: string; location_type: string; platform: string; city: string },
  origin: string,
  t: T,
): CalendarEvent {
  const url = `${origin}/games/${s.slug}`;
  const where = s.location_type === "online" ? s.platform || t("loc.online") : s.city;
  return {
    uid: `session-${s.id}@questboard`,
    start: new Date(s.starts_at),
    minutes: s.duration_minutes,
    title: `${s.title} (${s.system})`,
    description: t("cal.description", { where }),
    location: where,
    url,
  };
}

export function googleCalendarUrl(e: Omit<CalendarEvent, "uid">): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(end)}`,
    details: `${e.description}\n\n${e.url}`,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
