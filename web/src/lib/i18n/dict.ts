// UI dictionary for Quest Board — English (default) and Bahasa Indonesia.
// Both languages, for the server and node --test. Client components get only their own language
// (components/i18n-provider.tsx); the strings themselves are in en.ts and id.ts.
//
// Conventions
// - Keys are "namespace.name". `en` defines the key set; `id` must match it
//   exactly (enforced by the Record<MsgKey, string> type).
// - Placeholders: {name}. Plurals: "one|other" chosen by the {n} variable.
// - User-generated content (game titles, descriptions, chat) is never translated.

import { en } from "./en.ts";
import { id } from "./id.ts";
import { DEFAULT_LANG, translator, type Lang, type Messages, type MsgKey, type T } from "./core.ts";

export { DEFAULT_LANG, DELETED_NAME, LANGS, LANG_COOKIE, shownName, translator } from "./core.ts";
export type { Lang, Messages, MsgKey, T } from "./core.ts";

export const DICTIONARIES: Record<Lang, Messages> = { en, id };

/** True when `k` is a translation key (e.g. to validate a key read from a cookie). */
export function isMsgKey(k: string): k is MsgKey {
  return Object.prototype.hasOwnProperty.call(DICTIONARIES.en, k);
}

/** Build a translator for a language (missing strings fall back to English). */
export function makeT(lang: Lang): T {
  return translator(DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANG], DICTIONARIES.en);
}
