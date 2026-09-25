"use client";

import { createContext, useContext, useMemo } from "react";
import { makeT, type Lang, type T } from "@/lib/i18n/dict";

const I18nContext = createContext<{ lang: Lang; t: T } | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translation helpers for client components. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
