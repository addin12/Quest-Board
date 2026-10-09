"use client";

import { useReportWebVitals } from "next/web-vitals";

// Real visitors' Core Web Vitals → /api/vitals (one small beacon per metric, sent even as the page closes).
// No cookies, account or query string: the server keeps only the route pattern (lib/vitals.ts).
const report: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  const body = JSON.stringify({ path: location.pathname, name: metric.name, value: metric.value });
  try {
    if (!navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/vitals", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch {
    // never let measuring break the page
  }
};

export function WebVitals() {
  useReportWebVitals(report); // a stable function: each metric is reported once
  return null;
}
