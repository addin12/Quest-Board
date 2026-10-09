// Core Web Vitals from real visitors (CLAUDE.md, Next.js and React). Pure, so node --test can load it.
// A page is recorded by its route pattern only (/games/[slug], never the game or a query string), which
// keeps the table small and says nothing about who looked at what.

export const VITAL_METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];
export type Vital = { page: string; metric: VitalMetric; value: number };

/** Google's thresholds: [good up to, poor from]. CLS has no unit; the rest are milliseconds. */
export const THRESHOLDS: Record<VitalMetric, [number, number]> = {
  LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800],
};

const DYNAMIC: [RegExp, string][] = [
  [/^\/games\/[^/]+$/, "/games/[slug]"],
  [/^\/gms\/[^/]+$/, "/gms/[id]"],
  [/^\/board\/\d+$/, "/board/[id]"],
  [/^\/board\/\d+\/edit$/, "/board/[id]/edit"],
  [/^\/browse\/[^/]+\/[^/]+$/, "/browse/[type]/[value]"],
  [/^\/gm\/games\/\d+(\/edit)?$/, "/gm/games/[id]"],
  [/^\/hire-a-gm\/requests\/\d+$/, "/hire-a-gm/requests/[id]"],
  [/^\/questions\/\d+$/, "/questions/[id]"],
  [/^\/book\/\d+$/, "/book/[id]"],
  [/^\/invite\/[^/]+$/, "/invite/[token]"],
];
const STATIC = new Set([
  "/", "/games", "/how-it-works", "/become-a-gm", "/hire-a-gm", "/hire-a-gm/request", "/board", "/board/new", "/browse",
  "/login", "/login/code", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/change-email",
  "/dashboard", "/gm", "/gm/games/new", "/settings", "/notifications", "/questions", "/opening", "/quiz", "/feedback",
  "/privacy", "/terms", "/admin", "/admin/errors", "/admin/reports", "/admin/users", "/admin/gms", "/admin/feedback", "/admin/setup",
]);

/**
 * The route pattern a visited path belongs to, or null for a path that isn't ours.
 * @example vitalsPage("/id/games/kopi-naga?x=1") // "/games/[slug]"
 */
export function vitalsPage(path: string): string | null {
  const p = (path.split(/[?#]/)[0].replace(/^\/(en|id)(?=\/|$)/, "") || "/").replace(/\/+$/, "") || "/";
  if (STATIC.has(p)) return p;
  for (const [re, pattern] of DYNAMIC) if (re.test(p)) return pattern;
  return null;
}

/** One measurement from the browser (components/web-vitals.tsx), checked for shape and range. */
export function parseVital(payload: unknown): Vital | null {
  if (!payload || typeof payload !== "object") return null;
  const { path, name, value } = payload as Record<string, unknown>;
  if (typeof path !== "string" || path.length > 300 || typeof value !== "number" || !Number.isFinite(value)) return null;
  const metric = VITAL_METRICS.find((m) => m === name);
  const page = vitalsPage(path);
  if (!metric || !page) return null;
  const max = metric === "CLS" ? 10 : 120_000; // anything larger is a broken measurement
  if (value < 0 || value > max) return null;
  return { page, metric, value: metric === "CLS" ? Math.round(value * 1000) / 1000 : Math.round(value) };
}

/**
 * The 75th percentile (what Google reports): 3 in 4 visits were at least this fast.
 * @example p75([100, 200, 300, 400]) // 300
 */
export function p75(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.75 * sorted.length) - 1)];
}

/** "good" | "needs-improvement" | "poor" for a metric's value. */
export function vitalRating(metric: VitalMetric, value: number): "good" | "needs-improvement" | "poor" {
  const [good, poor] = THRESHOLDS[metric];
  return value <= good ? "good" : value < poor ? "needs-improvement" : "poor";
}
