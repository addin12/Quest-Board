import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, makeT, type Lang } from "./dict";

/**
 * Resolve the viewer's language: a /id or /en URL prefix (set by src/proxy.ts) wins,
 * then the explicit choice from the ID/EN switcher (cookie), otherwise English — the
 * default for every visitor, regardless of browser language.
 */
export const getLang = cache(async (): Promise<Lang> => {
  const prefixed = (await headers()).get("x-qb-lang");
  if (prefixed === "id" || prefixed === "en") return prefixed;
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  return chosen === "id" || chosen === "en" ? chosen : DEFAULT_LANG;
});

export async function getI18n() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
