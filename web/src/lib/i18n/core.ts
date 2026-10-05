// The dictionary's types and helpers, without any strings — so client code can import them without
// downloading both languages (each browser gets only its own: components/i18n-provider.tsx).
// Pure module: only `import type`.
import type { en } from "./en.ts";

export type Lang = "id" | "en";
export const LANGS: Lang[] = ["en", "id"];
export const DEFAULT_LANG: Lang = "en";
export const LANG_COOKIE = "qb_lang";

export type MsgKey = keyof typeof en;
export type Messages = Record<MsgKey, string>;
export type T = (key: MsgKey, vars?: Record<string, string | number>) => string;

/** A translator over one language's strings (and an optional fallback). "a|b" strings pick a (n === 1) or b. */
export function translator(dict: Messages, fallback?: Messages): T {
  return (key, vars) => {
    let s = dict[key] ?? fallback?.[key] ?? key;
    if (s.includes("|")) {
      const [one, other] = s.split("|");
      s = vars?.n === 1 ? one : other;
    }
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}

/** Name stored for deleted accounts; shown localized via shownName(). */
export const DELETED_NAME = "Anonymous";

/** A person's display name, with deleted accounts shown as the localized "Anonymous". */
export function shownName(name: string, t: T): string {
  return name === DELETED_NAME ? t("user.deleted") : name;
}
