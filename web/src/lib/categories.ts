// Game categories: genres and play styles (a fixed, translated taxonomy),
// plus helpers for browsing by game system. Pure module (type-only imports)
// so forms, queries, pages and unit tests share one source of truth.
//
// Labels:        t(`genre.${key}`)  / t(`style.${key}`)
// Descriptions:  t(`genreDesc.${key}`) / t(`styleDesc.${key}`)

import type { RegularIcon } from "./icons";
import type { MsgKey } from "./i18n/dict";

export const GENRES = [
  { key: "fantasy", icon: "dragon" },
  { key: "dark-fantasy", icon: "skull" },
  { key: "horror", icon: "ghost" },
  { key: "sci-fi", icon: "rocket" },
  { key: "cyberpunk", icon: "bolt" },
  { key: "mystery", icon: "fingerprint" },
  { key: "post-apocalyptic", icon: "radiation" },
  { key: "urban", icon: "city" },
  { key: "historical", icon: "castle" },
  { key: "cozy", icon: "campfire" },
] as const satisfies readonly { key: string; icon: RegularIcon }[];

export const STYLES = [
  { key: "roleplay-heavy", icon: "theater-masks" },
  { key: "combat-heavy", icon: "sword" },
  { key: "tactical", icon: "chess" },
  { key: "rule-of-cool", icon: "sparkles" },
  { key: "theater-of-mind", icon: "brain" },
  { key: "sandbox", icon: "map" },
  { key: "puzzle-mystery", icon: "puzzle" },
  { key: "dungeon-crawl", icon: "axe" },
  { key: "narrative", icon: "feather" },
] as const satisfies readonly { key: string; icon: RegularIcon }[];

export type GenreKey = (typeof GENRES)[number]["key"];
export type StyleKey = (typeof STYLES)[number]["key"];
export type CategoryType = "genre" | "style" | "system";

/** Each game may carry at most this many genres and this many styles. */
export const MAX_PER_GAME = 3;

export const isGenre = (k: string): k is GenreKey => GENRES.some((g) => g.key === k);
export const isStyle = (k: string): k is StyleKey => STYLES.some((s) => s.key === k);

export const genreLabelKey = (k: GenreKey) => `genre.${k}` as MsgKey;
export const genreDescKey = (k: GenreKey) => `genreDesc.${k}` as MsgKey;
export const styleLabelKey = (k: StyleKey) => `style.${k}` as MsgKey;
export const styleDescKey = (k: StyleKey) => `styleDesc.${k}` as MsgKey;
export const genreIcon = (k: GenreKey): RegularIcon => GENRES.find((g) => g.key === k)!.icon;
export const styleIcon = (k: StyleKey): RegularIcon => STYLES.find((s) => s.key === k)!.icon;

/**
 * Normalise submitted category keys (array from checkboxes or a CSV string):
 * keeps only known keys, removes duplicates, preserves taxonomy order, caps
 * at MAX_PER_GAME. Returns the CSV stored in games.genres / games.styles.
 */
export function normalizeCategories(input: readonly string[] | string, kind: "genre" | "style"): string {
  const raw = typeof input === "string" ? input.split(",") : input;
  const wanted = new Set(raw.map((s) => s.trim()).filter(Boolean));
  const order = kind === "genre" ? GENRES : STYLES;
  return order
    .map((c) => c.key)
    .filter((k) => wanted.has(k))
    .slice(0, MAX_PER_GAME)
    .join(",");
}

export function parseCategoryCsv(csv: string): string[] {
  return csv.split(",").map((s) => s.trim()).filter(Boolean);
}

/** URL slug for a game system, e.g. "D&D 5.5e (2024)" → "dnd-5-5e-2024". */
export function systemSlug(system: string): string {
  return (
    system
      .toLowerCase()
      .replace(/&/g, "n")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

/** Known systems with a translated blurb (t(`systemDesc.${slug}`)). */
export const SYSTEM_BLURBS = [
  "dnd-5-5e-2024", "dnd-5e-2014", "pathfinder-2e", "call-of-cthulhu", "daggerheart",
  "blades-in-the-dark", "vampire-the-masquerade", "mothership", "shadowrun", "starfinder",
] as const;

export const systemDescKey = (slug: string): MsgKey | null =>
  (SYSTEM_BLURBS as readonly string[]).includes(slug) ? (`systemDesc.${slug}` as MsgKey) : null;
