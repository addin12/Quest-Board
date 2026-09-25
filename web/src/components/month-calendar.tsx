"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

export type CalendarItem = { id: string; title: string; href: string; startsAt: string; kind: "booked" | "waitlist" | "offered" };

const noop = () => () => {};

/**
 * Month view of the viewer's sessions, computed in the browser's own timezone.
 * Desktop: a 7-column grid. Phones: an agenda list for the month (a grid is too cramped).
 */
export function MonthCalendar({ items }: { items: CalendarItem[] }) {
  const { lang, t } = useI18n();
  const locale = lang === "id" ? "id-ID" : "en-GB";
  // Rendered on the client only: the grid depends on the viewer's timezone and "today".
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [offset, setOffset] = useState(0);

  const { monthStart, days, byDay, monthItems } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const firstWeekday = (monthStart.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const days: (Date | null)[] = [
      ...Array.from({ length: firstWeekday }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1)),
    ];
    while (days.length % 7) days.push(null);
    const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const byDay = new Map<string, CalendarItem[]>();
    const monthItems: CalendarItem[] = [];
    for (const it of [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const d = new Date(it.startsAt);
      if (d.getFullYear() !== monthStart.getFullYear() || d.getMonth() !== monthStart.getMonth()) continue;
      monthItems.push(it);
      byDay.set(key(d), [...(byDay.get(key(d)) ?? []), it]);
    }
    return { monthStart, days, byDay: { get: (d: Date) => byDay.get(key(d)) ?? [] }, monthItems };
  }, [items, offset]);

  if (!mounted) return <div className="card h-96 animate-pulse" aria-hidden />;

  const monthTitle = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthStart);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, 1 + i)));
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const dayLabel = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(d);
  const today = new Date();
  const isToday = (d: Date) => d.toDateString() === today.toDateString();
  const tone = (k: CalendarItem["kind"]) =>
    k === "booked" ? "border-success/40 bg-success-soft text-success" : k === "offered" ? "border-accent/50 bg-accent-soft text-accent" : "border-border bg-surface-2 text-muted";

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost px-2.5!" onClick={() => setOffset((o) => o - 1)} aria-label={t("cal.prevMonth")}><Icon name="arrow-left" /></button>
        <h2 className="text-lg font-bold capitalize" aria-live="polite">{monthTitle}</h2>
        <button type="button" className="btn-ghost px-2.5!" onClick={() => setOffset((o) => o + 1)} aria-label={t("cal.nextMonth")}><Icon name="arrow-right" /></button>
      </div>

      {/* Desktop grid */}
      <table className="hidden w-full table-fixed border-collapse text-xs sm:table">
        <caption className="sr-only">{monthTitle}</caption>
        <thead>
          <tr>{weekdays.map((w) => <th key={w} scope="col" className="pb-2 text-center font-semibold uppercase tracking-wide text-muted">{w}</th>)}</tr>
        </thead>
        <tbody>
          {Array.from({ length: days.length / 7 }, (_, row) => (
            <tr key={row}>
              {days.slice(row * 7, row * 7 + 7).map((d, i) => (
                <td key={i} className={`h-24 border border-border p-1 align-top ${d ? "" : "bg-surface-2/40"}`}>
                  {d && (
                    <>
                      <span aria-hidden className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday(d) ? "bg-accent font-bold text-accent-ink" : "text-muted"}`}>
                        {d.getDate()}
                      </span>
                      <span className="sr-only">{dayLabel(d)}</span>
                      <ul className="mt-1 space-y-1">
                        {byDay.get(d).map((it) => (
                          <li key={it.id}>
                            <Link href={it.href} className={`block truncate rounded border px-1 py-0.5 font-semibold hover:underline ${tone(it.kind)}`} title={`${time(it.startsAt)} ${it.title}`}>
                              {time(it.startsAt)} {it.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone agenda */}
      <ul className="space-y-2 sm:hidden">
        {monthItems.map((it) => (
          <li key={it.id}>
            <Link href={it.href} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${tone(it.kind)}`}>
              <span className="min-w-0"><span className="block truncate font-semibold">{it.title}</span><span className="text-xs">{dayLabel(new Date(it.startsAt))} · {time(it.startsAt)}</span></span>
              <Icon name="arrow-right" />
            </Link>
          </li>
        ))}
      </ul>
      {monthItems.length === 0 && <p className="py-6 text-center text-sm text-muted">{t("cal.emptyMonth")}</p>}

      <p className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-success/40 bg-success-soft" /> {t("cal.legendBooked")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-accent/50 bg-accent-soft" /> {t("cal.legendOffered")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-border bg-surface-2" /> {t("cal.legendWaitlist")}</span>
      </p>
    </div>
  );
}
