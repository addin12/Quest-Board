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
  { key: "high-fantasy", icon: "crown" },
  { key: "gritty-fantasy", icon: "axe-battle" },
  { key: "low-magic", icon: "scroll" },
  { key: "grimdark", icon: "tombstone" },
  { key: "imaginative", icon: "magic-wand" },
  { key: "supernatural", icon: "moon-stars" },
  { key: "gothic-horror", icon: "bat" },
  { key: "eldritch-horror", icon: "eye" },
  { key: "survival", icon: "camping" },
  { key: "modern", icon: "building" },
  { key: "futuristic", icon: "satellite" },
  { key: "space-opera", icon: "planet-ringed" },
  { key: "space-western", icon: "hat-cowboy" },
  { key: "steampunk", icon: "gears" },
  { key: "superhero", icon: "hand-fist" },
  { key: "anime", icon: "star-shooting" },
  { key: "isekai", icon: "door-open" },
  { key: "pirate", icon: "skull-crossbones" },
  { key: "viking", icon: "helmet-battle" },
  { key: "western", icon: "horse" },
  { key: "victorian", icon: "umbrella" },
  { key: "rustic", icon: "wheat" },
  { key: "political-intrigue", icon: "chess-queen" },
  { key: "espionage", icon: "spy" },
  { key: "comedy", icon: "laugh-beam" },
  { key: "wacky", icon: "confetti" },
  { key: "heartwarming", icon: "hands-heart" },
  { key: "romance", icon: "heart" },
  { key: "battle-royale", icon: "trophy" },
  { key: "universal", icon: "globe" },
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
  { key: "roleplay-light", icon: "smile" },
  { key: "combat-light", icon: "shield" },
  { key: "rules-as-written", icon: "book-open-reader" },
  { key: "hexcrawl", icon: "hexagon" },
  { key: "kingdom-building", icon: "chess-rook" },
  { key: "west-marches", icon: "route" },
  { key: "organized-play", icon: "list-check" },
  { key: "play-by-post", icon: "comment-dots" },
] as const satisfies readonly { key: string; icon: RegularIcon }[];

/**
 * Game mechanics (browse only): each lists the systems built on it, so games are found
 * through their system and GMs never tag mechanics by hand. Names are proper nouns
 * (not translated); descriptions are t(`mechanicDesc.${key}`).
 */
export const MECHANICS = [
  { key: "d20-system", icon: "dice-d20", name: "d20 System", systems: ["D&D 5.5e (2024)", "D&D 5e (2014)", "Pathfinder 2e", "Pathfinder 1e", "Starfinder", "Starfinder 2e", "Dark Matter", "Star Wars 5e", "Dungeons & Dragons 3/3.5e", "Tales of the Valiant", "Shadowdark RPG", "Cosmere Roleplaying Game", "Lancer", "Mutants & Masterminds (3e)", "Dungeon Crawl Classics", "Old-School Essentials", "Dungeons & Dragons B/X", "Advanced Dungeons & Dragons 2e", "Pokemon Tabletop United"] },
  { key: "dice-pool", icon: "dice", name: "Dice Pool System", systems: ["Vampire: The Masquerade", "Werewolf: The Apocalypse 5th Edition", "Mage: The Ascension 20th Anniversary Edition", "Hunter: The Reckoning", "Vampire: The Requiem 2nd Edition", "Mage: The Awakening 2nd Edition", "Changeling: The Lost Second Edition", "Exalted 3rd Edition", "Shadowrun", "Blades in the Dark", "Blades '68", "Scum and Villainy", "Alien: The Roleplaying Game", "Alien RPG Evolved Edition", "Vaesen", "Forbidden Lands", "Mutant: Year Zero", "Coriolis – The Third Horizon", "Tales From the Loop", "The Walking Dead Universe Roleplaying Game", "Legend of the Five Rings 5th Edition", "Warhammer 40,000 Wrath & Glory", "A Song of Ice and Fire Roleplaying", "Star Wars RPG by Fantasy Flight Games", "Candela Obscura", "Slugblaster", "The Wildsea", "Girl By Moonlight", "CBR+PNK", "Triangle Agency"] },
  { key: "basic-roleplaying", icon: "percentage", name: "Basic Roleplaying (BRP)", systems: ["Call of Cthulhu", "Pulp Cthulhu", "Delta Green", "Pendragon 6th Edition"] },
  { key: "storyteller", icon: "moon", name: "Storyteller System", systems: ["Vampire: The Masquerade", "Werewolf: The Apocalypse 5th Edition", "Mage: The Ascension 20th Anniversary Edition", "Hunter: The Reckoning", "Vampire: The Requiem 2nd Edition", "Mage: The Awakening 2nd Edition", "Changeling: The Lost Second Edition", "Exalted 3rd Edition"] },
  { key: "osr", icon: "dungeon", name: "OSR", systems: ["Shadowdark RPG", "Old-School Essentials", "Dungeons & Dragons B/X", "Advanced Dungeons & Dragons 2e", "Dungeon Crawl Classics", "Mörk Borg", "Pirate Borg", "CY_BORG", "Mythic Bastionland", "Death in Space", "Mothership"] },
  { key: "powered-by-the-apocalypse", icon: "radiation", name: "Powered by the Apocalypse", systems: ["Monster of the Week", "Masks: A New Generation", "Monsterhearts 2", "Thirsty Sword Lesbians", "Avatar Legends: The RPG", "City of Mist", "Brindlewood Bay"] },
  { key: "exploding-dice", icon: "bomb", name: "Exploding Dice", systems: ["Savage Worlds", "Kids on Bikes", "Kids on Brooms", "Legend of the Five Rings 5th Edition"] },
  { key: "year-zero-engine", icon: "dice-d6", name: "Year Zero Engine", systems: ["Alien: The Roleplaying Game", "Alien RPG Evolved Edition", "Vaesen", "Forbidden Lands", "Mutant: Year Zero", "Coriolis – The Third Horizon", "Tales From the Loop", "Blade Runner: The Roleplaying Game", "The Walking Dead Universe Roleplaying Game"] },
  { key: "forged-in-the-dark", icon: "dagger", name: "Forged in the Dark", systems: ["Blades in the Dark", "Blades '68", "Scum and Villainy", "CBR+PNK", "Girl By Moonlight"] },
  { key: "interlock", icon: "microchip", name: "Interlock System", systems: ["Cyberpunk Red"] },
  { key: "2d20-system", icon: "dice-alt", name: "2d20 System", systems: ["Star Trek Adventures - First Edition", "Star Trek Adventures - Second Edition", "Dune: Adventures in the Imperium", "Fallout: The Roleplaying Game"] },
  { key: "narrative-dice", icon: "rocket-lunch", name: "Narrative Dice System", systems: ["Star Wars RPG by Fantasy Flight Games"] },
  { key: "powered-by-mork-borg", icon: "skull", name: "Powered by Mörk Borg", systems: ["Mörk Borg", "Pirate Borg", "CY_BORG"] },
  { key: "d616", icon: "bolt", name: "d616 System", systems: ["Marvel Multiverse Role-Playing Game"] },
  { key: "illuminated-worlds", icon: "lamp", name: "Illuminated Worlds", systems: ["Candela Obscura"] },
  { key: "essence20", icon: "robot", name: "Essence20 System", systems: ["Transformers Roleplaying Game", "Power Rangers Roleplaying Game"] },
  { key: "fudge", icon: "dice-four", name: "Fudge System", systems: ["Fate"] },
] as const satisfies readonly { key: string; icon: RegularIcon; name: string; systems: readonly string[] }[];

export type MechanicKey = (typeof MECHANICS)[number]["key"];
export const isMechanic = (k: string): k is MechanicKey => MECHANICS.some((m) => m.key === k);
export const mechanicDescKey = (k: MechanicKey) => `mechanicDesc.${k}` as MsgKey;
export const getMechanic = (k: MechanicKey) => MECHANICS.find((m) => m.key === k)!;
/** Mechanics a system is built on (a system can have several, e.g. OSR + d20). */
export const mechanicsForSystem = (system: string) => MECHANICS.filter((m) => (m.systems as readonly string[]).includes(system));

export type GenreKey = (typeof GENRES)[number]["key"];
export type StyleKey = (typeof STYLES)[number]["key"];
export type CategoryType = "genre" | "style" | "system" | "mechanic";

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
