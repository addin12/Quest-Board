// Pure: time zones for emails. The website shows times in the viewer's own device zone; an email
// can't, so each person has a users.time_zone (detected at sign-up, changeable in Settings).
// Indonesia has three zones — WIB, WITA, WIT — and Intl only knows them as "GMT+7/8/9".

export const DEFAULT_TIME_ZONE = "Asia/Jakarta";

/** The three Indonesian zones, as offered in Settings. */
export const INDONESIAN_ZONES = [
  { tz: "Asia/Jakarta", label: "WIB" },
  { tz: "Asia/Makassar", label: "WITA" },
  { tz: "Asia/Jayapura", label: "WIT" },
] as const;

const INDONESIAN_LABELS: Record<string, string> = {
  "Asia/Jakarta": "WIB", "Asia/Pontianak": "WIB",
  "Asia/Makassar": "WITA", "Asia/Ujung_Pandang": "WITA",
  "Asia/Jayapura": "WIT",
};

/** A real IANA zone name we can format in (anything else falls back to the default). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneOr = (tz: unknown): string => (isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE);

/** "WIB" / "WITA" / "WIT", or what Intl calls it elsewhere ("GMT+8", "CEST"…). */
export function zoneLabel(tz: string, lang: "en" | "id", at = new Date()): string {
  if (INDONESIAN_LABELS[tz]) return INDONESIAN_LABELS[tz];
  const part = new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

/** "Sat 3 Oct, 19.00 WIB" — a session time in an email, in the reader's zone. */
export function formatWhen(iso: string, lang: "en" | "id", tz: string = DEFAULT_TIME_ZONE): string {
  const zone = timeZoneOr(tz);
  const at = new Date(iso);
  const s = new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone,
  }).format(at);
  return `${s.replace(/(\d{2}):(\d{2})/, "$1.$2")} ${zoneLabel(zone, lang, at)}`;
}

/** "29 September" (or with the year: "29 Sept 2026") — a day, in the reader's zone. */
export function formatDay(at: Date, lang: "en" | "id", tz: string = DEFAULT_TIME_ZONE, withYear = false): string {
  const opts: Intl.DateTimeFormatOptions = withYear ? { dateStyle: "medium" } : { day: "numeric", month: "long" };
  return at.toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", { ...opts, timeZone: timeZoneOr(tz) });
}

/** "29 Sept 2026, 14.05 WITA" — when something happened, for security emails. */
export function formatMoment(at: Date, lang: "en" | "id", tz: string = DEFAULT_TIME_ZONE): string {
  const zone = timeZoneOr(tz);
  const s = at.toLocaleString(lang === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: zone });
  return `${s} ${zoneLabel(zone, lang, at)}`;
}
