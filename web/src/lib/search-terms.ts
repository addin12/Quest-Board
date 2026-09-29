// Pure: turns a search box query into terms, each matched on its own (words in any order).
// A word that names a genre, style or experience level in either language ("horor", "pemula",
// "misteri", "tactical") also matches games tagged with it, not just games whose text says it.
import { GENRES, STYLES, type GenreKey, type StyleKey } from "./categories";
import { DICTIONARIES } from "./i18n/dict";

export type SearchTerm = { text: string; genres: GenreKey[]; styles: StyleKey[]; level?: "beginner" | "experienced" };

export const MAX_TERMS = 6;

// Words that carry no meaning for search (and would match almost everything).
const STOP = new Set(["di", "ke", "dan", "yang", "untuk", "dengan", "atau", "the", "a", "an", "and", "or", "of", "for", "in", "with", "game", "games", "main", "play", "rpg", "ttrpg"]);
// Words inside multi-word labels that shouldn't pull in a category on their own.
const LABEL_NOISE = new Set(["rule", "rules", "cool", "play", "post", "mind", "light", "heavy", "written", "aturan", "tertulis", "sesuai", "hati", "building", "membangun", "theater"]);
const LEVELS: Record<string, "beginner" | "experienced"> = {
  beginner: "beginner", beginners: "beginner", newbie: "beginner", pemula: "beginner", newcomer: "beginner",
  experienced: "experienced", veteran: "experienced", veterans: "experienced", berpengalaman: "experienced", expert: "experienced",
};
// Common shorthand for systems.
const ALIASES: Record<string, string> = { dnd: "d&d", coc: "cthulhu", pf2e: "pathfinder", pf: "pathfinder" };

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}&]+/u).filter(Boolean);

let categoryWords: Map<string, { genres: Set<GenreKey>; styles: Set<StyleKey> }> | null = null;
function categoryIndex() {
  if (categoryWords) return categoryWords;
  const map = new Map<string, { genres: Set<GenreKey>; styles: Set<StyleKey> }>();
  const add = (word: string, kind: "genres" | "styles", key: string) => {
    if (word.length < 4 || LABEL_NOISE.has(word)) return;
    const e = map.get(word) ?? { genres: new Set(), styles: new Set() };
    (e[kind] as Set<string>).add(key);
    map.set(word, e);
  };
  for (const dict of Object.values(DICTIONARIES)) {
    for (const g of GENRES) for (const w of words(`${dict[`genre.${g.key}`]} ${g.key}`)) add(w, "genres", g.key);
    for (const s of STYLES) for (const w of words(`${dict[`style.${s.key}`]} ${s.key}`)) add(w, "styles", s.key);
  }
  // One-word labels and their translation are the same word ("Horror"/"Horor"): share what they match,
  // so "horor" also finds "Gothic horror", whose label is English in both languages.
  const { en, id } = DICTIONARIES;
  for (const key of [...GENRES.map((g) => `genre.${g.key}` as const), ...STYLES.map((s) => `style.${s.key}` as const)]) {
    const [a, b] = [words(en[key]), words(id[key])];
    if (a.length !== 1 || b.length !== 1 || a[0] === b[0]) continue;
    const ea = map.get(a[0]), eb = map.get(b[0]);
    if (!ea || !eb) continue;
    for (const k of ea.genres) eb.genres.add(k); for (const k of eb.genres) ea.genres.add(k);
    for (const k of ea.styles) eb.styles.add(k); for (const k of eb.styles) ea.styles.add(k);
  }
  return (categoryWords = map);
}

export function parseSearch(q: string): SearchTerm[] {
  const seen = new Set<string>();
  const terms: SearchTerm[] = [];
  for (const raw of words(q)) {
    const word = ALIASES[raw] ?? raw;
    if (STOP.has(word) || seen.has(word) || (word.length < 2 && !/\d/.test(word))) continue;
    seen.add(word);
    const cat = categoryIndex().get(word);
    terms.push({ text: word, genres: [...(cat?.genres ?? [])], styles: [...(cat?.styles ?? [])], level: LEVELS[word] });
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}
