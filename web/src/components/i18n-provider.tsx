"use client";

import { createContext, use, useContext, useMemo } from "react";
import { translator, type Lang, type Messages, type T } from "@/lib/i18n/core";

// Client components translate through this context. Each language's strings are their own chunk, loaded
// on demand: a phone downloads one language, not both (round 32: the two together were a quarter of every
// page's JavaScript). The page is already drawn by the server; only hydration waits for that one chunk.

const loaders: Record<Lang, () => Promise<Messages>> = {
  en: () => import("@/lib/i18n/en").then((m) => m.en),
  id: () => import("@/lib/i18n/id").then((m) => m.id),
};
const loading = new Map<Lang, Promise<Messages>>();
function messagesFor(lang: Lang): Promise<Messages> {
  let p = loading.get(lang);
  if (!p) loading.set(lang, (p = loaders[lang]()));
  return p;
}
// In the browser, start fetching the page's language as soon as this module runs (before React renders).
if (typeof document !== "undefined") void messagesFor(document.documentElement.lang === "id" ? "id" : "en");

const I18nContext = createContext<{ lang: Lang; t: T } | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const messages = use(messagesFor(lang));
  const value = useMemo(() => ({ lang, t: translator(messages) }), [lang, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translation helpers for client components. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
