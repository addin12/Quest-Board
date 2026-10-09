// Input validation for forms. Pure functions returning either parsed values
// or a map of field errors. Errors are translation keys (see i18n/dict.ts),
// so messages render in the viewer's language.

import type { MsgKey } from "./i18n/dict";
import { isCommonPassword } from "./common-passwords";

export type FieldErrors = Record<string, MsgKey>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const MAX_PRICE_IDR = 10_000_000; // mirrors policy.ts (kept import-free for node --test)

/** D&D 5e is split by edition: the 2014 rules and the revised 2024 rules ("5.5e"). */
export const SYSTEMS = [
  "D&D 5.5e (2024)",
  "D&D 5e (2014)",
  "Pathfinder 2e",
  "Call of Cthulhu",
  "Daggerheart",
  "Blades in the Dark",
  "Vampire: The Masquerade",
  "Mothership",
  "Shadowrun",
  "Starfinder",
  // More systems (A–Z), from StartPlaying's catalogue. Suggestions only: GMs may type any system.
  "A Song of Ice and Fire Roleplaying",
  "Advanced Dungeons & Dragons 2e",
  "Alice is Missing",
  "Alien RPG Evolved Edition",
  "Alien: The Roleplaying Game",
  "Avatar Legends: The RPG",
  "Blade Runner: The Roleplaying Game",
  "Blades '68",
  "Brindlewood Bay",
  "Candela Obscura",
  "CBR+PNK",
  "Changeling: The Lost Second Edition",
  "City of Mist",
  "Coriolis – The Third Horizon",
  "Cosmere Roleplaying Game",
  "CY_BORG",
  "Cyberpunk Red",
  "Cypher",
  "Cypher System",
  "Dark Matter",
  "Death in Space",
  "Delta Green",
  "DIE: The Roleplaying Game",
  "Dragonbane",
  "Draw Steel",
  "Dune: Adventures in the Imperium",
  "Dungeon Crawl Classics",
  "Dungeons & Dragons 3/3.5e",
  "Dungeons & Dragons B/X",
  "Exalted 3rd Edition",
  "Fablecraft",
  "Fabula Ultima",
  "Fallout: The Roleplaying Game",
  "Fate",
  "Forbidden Lands",
  "Girl By Moonlight",
  "GURPS",
  "Hunter: The Reckoning",
  "Invincible Superhero Roleplaying",
  "Kids on Bikes",
  "Kids on Brooms",
  "Lancer",
  "Legend in the Mist",
  "Legend of the Five Rings 5th Edition",
  "Mage: The Ascension 20th Anniversary Edition",
  "Mage: The Awakening 2nd Edition",
  "Marvel Multiverse Role-Playing Game",
  "Masks: A New Generation",
  "Monster of the Week",
  "Monsterhearts 2",
  "Mörk Borg",
  "Mutant: Year Zero",
  "Mutants & Masterminds (3e)",
  "Mythic Bastionland",
  "Old-School Essentials",
  ":Otherscape",
  "Pathfinder 1e",
  "Pendragon 6th Edition",
  "Pirate Borg",
  "Pokemon Tabletop United",
  "Power Rangers Roleplaying Game",
  "Pulp Cthulhu",
  "Savage Worlds",
  "Scum and Villainy",
  "Shadowdark RPG",
  "SHIFT RPG",
  "Slugblaster",
  "Star Trek Adventures - First Edition",
  "Star Trek Adventures - Second Edition",
  "Star Wars 5e",
  "Star Wars RPG by Fantasy Flight Games",
  "Starfinder 2e",
  "Tales From the Loop",
  "Tales of the Valiant",
  "The Last Caravan: A Cars and Aliens RPG",
  "The One Ring 2e",
  "The Sword, The Crown, and The Unspeakable Power",
  "The Walking Dead Universe Roleplaying Game",
  "The Wildsea",
  "Thirsty Sword Lesbians",
  "Transformers Roleplaying Game",
  "Traveller",
  "Triangle Agency",
  "Vaesen",
  "Vampire: The Requiem 2nd Edition",
  "Warhammer 40,000 Imperium Maledictum",
  "Warhammer 40,000 Wrath & Glory",
  "Warhammer Fantasy Roleplay",
  "Werewolf: The Apocalypse 5th Edition",
  "Other",
] as const;

export type GameLanguage = "id" | "en" | "both";

/** Loose on purpose: the confirmation link is the real check. */
export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export type SignupInput = { name: string; email: string; password: string; role: "player" | "gm" };

export function parseSignup(raw: Record<string, unknown>): Parsed<SignupInput> {
  const errors: FieldErrors = {};
  const name = str(raw.name);
  const email = str(raw.email).toLowerCase();
  const password = typeof raw.password === "string" ? raw.password : "";
  const role = raw.role === "gm" ? "gm" : "player";

  if (name.length < 2 || name.length > 50) errors.name = "v.name";
  if (!isEmail(email)) errors.email = "v.email";
  if (password.length < 8) errors.password = "v.password";
  else if (isCommonPassword(password, [name, email])) errors.password = "v.passwordCommon";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, email, password, role } };
}

export type GameInput = {
  title: string;
  system: string;
  summary: string;
  description: string;
  format: "one_shot" | "campaign";
  locationType: "online" | "in_person";
  language: GameLanguage;
  platform: string;
  /** Online only: the Discord/Meet/… link booked players use to join ("" when not set). */
  tableLink: string;
  city: string;
  /** In person only: the venue's name and its Google Maps share link ("" when not set). */
  venueName: string;
  venueMapsUrl: string;
  priceIdr: number;
  seatsTotal: number;
  experienceLevel: "any" | "beginner" | "experienced";
  minAge: number;
  contentWarnings: string;
  safetyTools: string;
  tags: string;
  status: "draft" | "published";
};

/**
 * A Google Maps link as the app's Share button gives it (maps.app.goo.gl/…), or a google.com/maps address.
 * @example isGoogleMapsUrl("https://maps.app.goo.gl/abc") // true · isGoogleMapsUrl("https://evil.example/maps") // false
 */
export function isGoogleMapsUrl(v: string): boolean {
  if (v.length > 500 || /[\s<>"']/.test(v)) return false;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return u.pathname.length > 1;
  if (host === "goo.gl") return u.pathname.startsWith("/maps/");
  if (/^(www\.)?google\.(com|co\.id)$/.test(host)) return u.pathname === "/maps" || u.pathname.startsWith("/maps/");
  if (/^maps\.google\.(com|co\.id)$/.test(host)) return true;
  return false;
}

/** Accepts "75.000", "Rp 75,000", "75000". Empty means free (0). */
function parsePrice(v: unknown): number {
  const s = str(v);
  if (!s) return 0;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : NaN;
}

export function parseGame(raw: Record<string, unknown>): Parsed<GameInput> {
  const errors: FieldErrors = {};
  const title = str(raw.title);
  const system = str(raw.system);
  const summary = str(raw.summary);
  const description = str(raw.description);
  const format = raw.format === "campaign" ? "campaign" : "one_shot";
  const locationType = raw.locationType === "in_person" ? "in_person" : "online";
  const language: GameLanguage = raw.language === "en" ? "en" : raw.language === "both" ? "both" : "id";
  const platform = str(raw.platform);
  const tableLink = locationType === "online" ? str(raw.tableLink) : "";
  const city = str(raw.city);
  const venueName = locationType === "in_person" ? str(raw.venueName) : "";
  const venueMapsUrl = locationType === "in_person" ? str(raw.venueMapsUrl) : "";
  const priceIdr = parsePrice(raw.price);
  const seatsTotal = Number(str(raw.seatsTotal) || "0");
  const minAge = Number(str(raw.minAge) || "18");
  const exp = str(raw.experienceLevel);
  const experienceLevel = exp === "beginner" || exp === "experienced" ? exp : "any";
  const status = raw.status === "draft" ? "draft" : "published";

  if (title.length < 4 || title.length > 80) errors.title = "v.title";
  if (!system) errors.system = "v.system";
  if (summary.length < 10 || summary.length > 160) errors.summary = "v.summary";
  if (description.length < 30) errors.description = "v.description";
  if (!Number.isInteger(priceIdr) || priceIdr < 0 || priceIdr > MAX_PRICE_IDR) errors.price = "v.price";
  if (!Number.isInteger(seatsTotal) || seatsTotal < 1 || seatsTotal > 12) errors.seatsTotal = "v.seats";
  if (!Number.isInteger(minAge) || minAge < 0 || minAge > 99) errors.minAge = "v.minAge";
  if (locationType === "online" && !platform) errors.platform = "v.platform";
  // An https link and nothing else (it's shown as a link to players).
  if (tableLink && (tableLink.length > 300 || !/^https:\/\/[^\s<>"']+\.[^\s<>"']+$/.test(tableLink))) errors.tableLink = "v.tableLink";
  if (locationType === "in_person" && !city) errors.city = "v.city";
  if (venueName.length > 100) errors.venueName = "v.venueName";
  // Only a Google Maps link: it's shown to everyone as "Open in Google Maps", so nothing else may hide behind it.
  if (venueMapsUrl && !isGoogleMapsUrl(venueMapsUrl)) errors.venueMapsUrl = "v.venueMaps";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      system,
      summary,
      description,
      format,
      locationType,
      language,
      platform,
      tableLink,
      city,
      venueName,
      venueMapsUrl,
      priceIdr,
      seatsTotal,
      experienceLevel,
      minAge,
      contentWarnings: str(raw.contentWarnings),
      safetyTools: str(raw.safetyTools),
      tags: str(raw.tags),
      status,
    },
  };
}

/** Sessions can be scheduled up to two years ahead. */
export const MAX_SCHEDULE_DAYS = 730;

export function parseSessionStart(dateTimeLocal: unknown, tzOffsetMinutes: unknown, now: Date): Parsed<Date> {
  // `datetime-local` gives "YYYY-MM-DDTHH:mm" in the GM's wall-clock time.
  // The browser sends its timezone offset (Date#getTimezoneOffset) so we can convert to UTC.
  const v = str(dateTimeLocal);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return { ok: false, errors: { startsAt: "v.startsAt" } };
  const offset = Number(tzOffsetMinutes) || 0;
  const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + offset * 60_000;
  const d = new Date(utcMs);
  if (d.getTime() <= now.getTime()) return { ok: false, errors: { startsAt: "v.startsFuture" } };
  if (d.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86_400_000) return { ok: false, errors: { startsAt: "v.startsTooFar" } };
  return { ok: true, value: d };
}

/** How many weekly sessions to create (1 = just this one). */
export const MAX_REPEAT_WEEKS = 12;
export function parseRepeat(raw: unknown): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_REPEAT_WEEKS, n)) : 1;
}

/** The start times of a weekly series: the first, then +7 days each (same UTC time). */
export function weeklyStarts(first: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(first.getTime() + i * 7 * 86_400_000));
}

export function parseReview(raw: Record<string, unknown>): Parsed<{ rating: number; body: string }> {
  const rating = Number(str(raw.rating));
  const body = str(raw.body);
  const errors: FieldErrors = {};
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "v.rating";
  if (body.length > 2000) errors.body = "v.reviewBody";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { rating, body } };
}

// ─── Hire a GM ─────────────────────────────────────────────────────────

export type GmRequestInput = {
  title: string;
  system: string;
  groupSize: number;
  experienceLevel: "any" | "beginner" | "experienced";
  language: GameLanguage;
  locationType: "online" | "in_person";
  city: string;
  schedule: string;
  budgetIdr: number;
  details: string;
};

export function parseGmRequest(raw: Record<string, unknown>): Parsed<GmRequestInput> {
  const errors: FieldErrors = {};
  const title = str(raw.title);
  const system = str(raw.system).slice(0, 60);
  const groupSize = Number(str(raw.groupSize) || "0");
  const exp = str(raw.experienceLevel);
  const experienceLevel = exp === "beginner" || exp === "experienced" ? exp : "any";
  const language: GameLanguage = raw.language === "en" ? "en" : raw.language === "both" ? "both" : "id";
  const locationType = raw.locationType === "in_person" ? "in_person" : "online";
  const city = str(raw.city).slice(0, 60);
  const schedule = str(raw.schedule);
  const budgetIdr = parsePrice(raw.budget);
  const details = str(raw.details);

  if (title.length < 5 || title.length > 80) errors.title = "v.requestTitle";
  if (!Number.isInteger(groupSize) || groupSize < 1 || groupSize > 12) errors.groupSize = "v.groupSize";
  if (locationType === "in_person" && !city) errors.city = "v.city";
  if (schedule.length < 3 || schedule.length > 200) errors.schedule = "v.schedule";
  if (!Number.isInteger(budgetIdr) || budgetIdr < 0 || budgetIdr > MAX_PRICE_IDR) errors.budget = "v.price";
  if (details.length < 20 || details.length > 2000) errors.details = "v.requestDetails";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, system, groupSize, experienceLevel, language, locationType, city, schedule, budgetIdr, details } };
}

export function parseOffer(raw: Record<string, unknown>): Parsed<{ message: string; priceIdr: number }> {
  const errors: FieldErrors = {};
  const message = str(raw.message);
  const priceIdr = parsePrice(raw.price);
  if (message.length < 10 || message.length > 1000) errors.message = "v.offerMessage";
  if (!Number.isInteger(priceIdr) || priceIdr < 0 || priceIdr > MAX_PRICE_IDR) errors.price = "v.price";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { message, priceIdr } };
}

export function parseProfile(raw: Record<string, unknown>): Parsed<{ name: string; bio: string }> {
  const name = str(raw.name);
  const bio = str(raw.bio);
  const errors: FieldErrors = {};
  if (name.length < 2 || name.length > 50) errors.name = "v.name";
  if (bio.length > 2000) errors.bio = "v.bioLong";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: { name, bio } };
}
