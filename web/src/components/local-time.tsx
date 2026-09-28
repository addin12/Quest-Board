"use client";

import { useSyncExternalStore } from "react";
import { useI18n } from "./i18n-provider";

const subscribe = () => () => {};

/** Default zone for server rendering — nearly all users are in Indonesia (WIB). */
const SSR_TIME_ZONE = "Asia/Jakarta";

/**
 * Renders a UTC timestamp in the viewer's own timezone and language. The
 * server renders Jakarta time; the client swaps in the browser's zone after
 * hydration (identical for most viewers, so there is no visible change).
 */
export function LocalTime({ iso, mode = "short" }: { iso: string; mode?: "short" | "long" | "time" | "date" }) {
  const { lang } = useI18n();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const opts: Intl.DateTimeFormatOptions =
    mode === "long"
      ? { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
      : mode === "time"
        ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
        : mode === "date"
          ? { day: "numeric", month: "short", year: "numeric" }
        : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  const text = new Date(iso).toLocaleString(lang === "id" ? "id-ID" : "en-GB", hydrated ? opts : { ...opts, timeZone: SSR_TIME_ZONE });
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
