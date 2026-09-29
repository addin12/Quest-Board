"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { WatchKind } from "@/lib/changes";

/**
 * Keeps a live thread up to date without websockets: every `seconds` while the tab is visible (and
 * when it becomes visible again) it asks /api/changes for the thread's change token, and re-fetches
 * the page's server data only when the token differs from the one this page was rendered with —
 * an open page with no news costs a tiny JSON request instead of a full re-render. Client state
 * (e.g. a half-typed message) survives a refresh.
 */
export function AutoRefresh({ watch, id, version, seconds = 15 }: { watch: WatchKind; id: number; version: string | null; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/changes?kind=${watch}&id=${id}`, { cache: "no-store" });
        if (res.ok && (await res.json()).v !== version) router.refresh();
      } catch {
        // Offline for a moment: try again next time.
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(tick, seconds * 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, watch, id, version, seconds]);
  return null;
}
