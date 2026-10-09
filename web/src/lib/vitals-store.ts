import "server-only";
import { db } from "./db";
import type { Vital, VitalMetric } from "./vitals";

// Storage for real visitors' web vitals (schema v41 web_vitals): kept 30 days, summarised for admins.

export const VITALS_KEEP_DAYS = 30;
/**
 * At most this many measurements a day per page, and in all: enough for a steady 75th percentile, and
 * a script posting fake numbers can neither fill the disk (≤ 300,000 rows over 30 days) nor drown real ones.
 */
export const VITALS_PER_PAGE_PER_DAY = 500;
export const VITALS_PER_DAY = 10_000;

/** Store one measurement unless today's caps are reached. Returns whether it was kept. */
export function recordVital(v: Vital, now = Date.now()): boolean {
  const today = new Date(now).toISOString().slice(0, 10);
  const c = db()
    .prepare("SELECT COUNT(*) AS total, COALESCE(SUM(page = ?), 0) AS page FROM web_vitals WHERE created_at >= ?")
    .get(v.page, today) as { total: number; page: number };
  if (c.total >= VITALS_PER_DAY || c.page >= VITALS_PER_PAGE_PER_DAY) return false;
  db().prepare("INSERT INTO web_vitals (page, metric, value, created_at) VALUES (?, ?, ?, ?)").run(v.page, v.metric, v.value, new Date(now).toISOString());
  return true;
}

export type VitalsRow = { page: string; samples: number } & Partial<Record<VitalMetric, number>>;

/**
 * Per page, the 75th percentile of each metric over the last `days`, busiest pages first. SQLite sorts
 * and picks the percentile (a window function), so only one row per page and metric reaches the app —
 * never the measurements themselves (CLAUDE.md: never load a whole table into memory). Same definition
 * as p75() in lib/vitals.ts: the value at position ceil(0.75 × n).
 */
export function vitalsSummary(days = 7, now = Date.now()): VitalsRow[] {
  const rows = db()
    .prepare(
      `WITH ranked AS (
         SELECT page, metric, value,
                ROW_NUMBER() OVER (PARTITION BY page, metric ORDER BY value) AS pos,
                COUNT(*) OVER (PARTITION BY page, metric) AS n
           FROM web_vitals WHERE created_at > ?
       )
       SELECT page, metric, value, n FROM ranked
        WHERE pos = MAX(1, CAST(0.75 * n AS INTEGER) + (0.75 * n > CAST(0.75 * n AS INTEGER)))`,
    )
    .all(new Date(now - days * 86_400_000).toISOString()) as { page: string; metric: VitalMetric; value: number; n: number }[];
  const byPage = new Map<string, VitalsRow>();
  for (const r of rows) {
    const row = byPage.get(r.page) ?? { page: r.page, samples: 0 };
    row[r.metric] = r.value;
    row.samples = r.metric === "LCP" ? r.n : Math.max(row.samples, row.LCP === undefined ? r.n : row.samples);
    byPage.set(r.page, row);
  }
  return [...byPage.values()].sort((a, b) => b.samples - a.samples || a.page.localeCompare(b.page)).slice(0, 40);
}

export function pruneVitals(now = Date.now()): number {
  return Number(db().prepare("DELETE FROM web_vitals WHERE created_at < ?").run(new Date(now - VITALS_KEEP_DAYS * 86_400_000).toISOString()).changes);
}
