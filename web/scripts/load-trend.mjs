// Compares a load-rehearsal result with the last good one (scripts/load-baseline.json), so a slowdown is
// noticed on the push that caused it. Only a warning, never a failure: shared CI machines and laptops vary
// by 20–30% from run to run on their own (TESTING.md, "Load rehearsal").
//
// A result is what `load-test.mjs --json` writes: { rps, users, ops: { page: { p95 }, … } }.
// A baseline entry: { rps, pageP95, users, measured } (measured = the date and commit it came from).

export const TOLERANCE = { rps: 0.7, pageP95: 1.6 }; // warn below 70% of the rate, or above 160% of the page p95

/** @param {Record<string, string | undefined>} [env] Where this run's baseline lives in load-baseline.json: CI machines and laptops differ too much to share one. */
export const baselineKey = (env = process.env) => (env.GITHUB_ACTIONS === "true" ? "ci" : "local");

/** Plain-language warnings, empty when the run is in line with the baseline (or there is none to compare). */
export function compareToBaseline(result, baseline) {
  if (!baseline || baseline.users !== result.users) return [];
  const out = [];
  if (result.rps < baseline.rps * TOLERANCE.rps) {
    out.push(`${result.rps.toFixed(1)} requests a second, down from ${baseline.rps} (${pct(result.rps / baseline.rps - 1)})`);
  }
  const p95 = result.ops?.page?.p95;
  if (typeof p95 === "number" && p95 > baseline.pageP95 * TOLERANCE.pageP95) {
    out.push(`pages take ${p95} ms at p95, up from ${baseline.pageP95} ms (${pct(p95 / baseline.pageP95 - 1)})`);
  }
  return out;
}

/** One line for the CI summary and the log. */
export const summaryLine = (r) =>
  `${r.rps.toFixed(1)} requests a second with ${r.users} users, ${r.errors} errors; pages p50 ${r.ops?.page?.p50 ?? "?"} ms, p95 ${r.ops?.page?.p95 ?? "?"} ms`;

const pct = (x) => `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`;
