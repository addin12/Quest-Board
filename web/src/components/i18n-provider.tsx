"use client";

import { createContext, useContext, useMemo } from "react";
import { translator, type Lang, type Messages, type T } from "@/lib/i18n/core";

// Client components translate through this context. The root layout passes the visitor's own language
// (never both) with the page itself, so the page can respond to taps as soon as it's hydrated. Round 32
// loaded the strings as a separate chunk instead; in Safari's engine (every iPhone browser) a tap in the
// moment before that chunk arrived was lost — 4 in 10 first taps in testing (round 35).

const I18nContext = createContext<{ lang: Lang; t: T } | null>(null);

export function I18nProvider({ lang, messages, children }: { lang: Lang; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: translator(messages) }), [lang, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Translation helpers for client components. */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
