import "server-only";
import { db } from "./db";
import { p75, type Vital, type VitalMetric } from "./vitals";

// Storage for real visitors' web vitals (schema v41 web_vitals): kept 30 days, summarised for admins.

export const VITALS_KEEP_DAYS = 30;

export function recordVital(v: Vital): void {
  db().prepare("INSERT INTO web_vitals (page, metric, value) VALUES (?, ?, ?)").run(v.page, v.metric, v.value);
}

export type VitalsRow = { page: string; samples: number } & Partial<Record<VitalMetric, number>>;

/** Per page, the 75th percentile of each metric over the last `days`, busiest pages first. */
export function vitalsSummary(days = 7, now = Date.now()): VitalsRow[] {
  const rows = db()
    .prepare("SELECT page, metric, value FROM web_vitals WHERE created_at > ? ORDER BY id DESC LIMIT 100000")
    .all(new Date(now - days * 86_400_000).toISOString()) as { page: string; metric: VitalMetric; value: number }[];
  const byPage = new Map<string, Map<VitalMetric, number[]>>();
  for (const r of rows) {
    const m = byPage.get(r.page) ?? new Map<VitalMetric, number[]>();
    m.set(r.metric, [...(m.get(r.metric) ?? []), r.value]);
    byPage.set(r.page, m);
  }
  return [...byPage].map(([page, m]) => {
    const row: VitalsRow = { page, samples: m.get("LCP")?.length ?? Math.max(0, ...[...m.values()].map((v) => v.length)) };
    for (const [metric, values] of m) row[metric] = p75(values);
    return row;
  }).sort((a, b) => b.samples - a.samples).slice(0, 40);
}

export function pruneVitals(now = Date.now()): number {
  return Number(db().prepare("DELETE FROM web_vitals WHERE created_at < ?").run(new Date(now - VITALS_KEEP_DAYS * 86_400_000).toISOString()).changes);
}
