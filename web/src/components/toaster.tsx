"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icon";

/**
 * Shows the server's one-shot toast for a few seconds, then clears its cookie.
 * `id` changes for every new toast, so the same message twice still shows twice.
 */
export function Toaster({ toast, closeLabel }: { toast: { text: string; id: string } | null; closeLabel: string }) {
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    document.cookie = "qb_toast=; Max-Age=0; path=/; SameSite=Lax";
    const timer = window.setTimeout(() => setHidden(toast.id), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const visible = toast && hidden !== toast.id;
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 xl:bottom-6">
      {visible && (
        <div className="parchment popover pointer-events-auto flex items-center gap-3 border-success/40! px-4 py-3 text-sm">
          <Icon name="check-circle" solid className="text-success" />
          <span>{toast.text}</span>
          <button type="button" onClick={() => setHidden(toast.id)} className="ml-1 rounded p-1 text-muted hover:text-text" aria-label={closeLabel}>
            <Icon name="cross-circle" />
          </button>
        </div>
      )}
    </div>
  );
}
