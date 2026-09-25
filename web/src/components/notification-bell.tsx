"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { markNotificationsReadAction } from "@/app/actions";
import type { NotificationView } from "@/lib/notification-view";
import { Avatar } from "./ui";
import { Icon } from "./icon";
import { LocalTime } from "./local-time";
import { useI18n } from "./i18n-provider";

/**
 * Header bell: shows the unread count and opens a popover with the latest
 * notifications. Opening it marks everything read; the list keeps its "new"
 * markers until the popover closes so people can see what was new.
 */
export function NotificationBell({ unread, items, openRequests }: { unread: number; items: NotificationView[]; openRequests: number }) {
  const { t } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false); // marked read during this page view
  const [, startTransition] = useTransition();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Navigating closes the popover; fresh server data (new count or newest item) resets "seen".
  const freshness = `${unread}:${items[0]?.id ?? 0}`;
  const [prev, setPrev] = useState({ path, freshness });
  if (prev.path !== path || prev.freshness !== freshness) {
    setPrev({ path, freshness });
    if (prev.path !== path) setOpen(false);
    if (prev.freshness !== freshness) setSeen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const n = seen || path === "/notifications" ? 0 : unread;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && n > 0) {
      setSeen(true);
      startTransition(() => markNotificationsReadAction());
    }
  }

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={n ? t("notif.bellUnread", { n }) : t("notif.bell")}
        title={t("notif.bell")}
        className="btn-ghost relative px-2.5"
      >
        <Icon name="bell" />
        {n > 0 && (
          <span aria-hidden className="badge absolute right-0.5 top-0.5">
            {n > 9 ? "9+" : n}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={t("notif.title")}
          className="parchment popover absolute right-0 top-full z-50 mt-2 w-[22rem] max-sm:fixed max-sm:inset-x-2 max-sm:top-16 max-sm:w-auto"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="font-display text-base font-semibold">{t("notif.title")}</p>
            <Link href="/notifications" className="text-xs font-semibold text-accent hover:underline">{t("notif.seeAll")}</Link>
          </div>
          {openRequests > 0 && (
            <Link href="/gm/requests" className="flex items-center gap-2 border-b border-border bg-accent-soft/60 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-accent-soft">
              <Icon name="inbox" /> <span className="flex-1">{t("notif.openRequests", { n: openRequests })}</span> <Icon name="arrow-right" />
            </Link>
          )}
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{t("notif.emptyTitle")}</p>
          ) : (
            <ul className="max-h-[min(24rem,60vh)] overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="border-b border-border last:border-b-0">
                  <Link href={item.href} className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-2 ${item.unread ? "bg-accent-soft/40" : ""}`}>
                    {item.actor ? (
                      <Avatar name={item.actor.name} hue={item.actor.hue} image={item.actor.image} size={32} />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted"><Icon name={item.icon} /></span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug">{item.text}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                        <Icon name={item.icon} className="text-accent" /> <LocalTime iso={item.createdAt} />
                      </span>
                    </span>
                    {item.unread && (
                      <>
                        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                        <span className="sr-only">{t("notif.new")}</span>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
