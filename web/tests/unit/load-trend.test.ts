// The load rehearsal's trend check (scripts/load-trend.mjs): a warning when a run falls well behind the
// last good one, nothing when it's within the usual run-to-run variation or there's nothing to compare.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { baselineKey, compareToBaseline, summaryLine } from "../../scripts/load-trend.mjs";

const run = (rps: number, p95: number, users = 100) => ({ rps, users, errors: 0, ops: { page: { p50: Math.round(p95 / 2), p95 } } });
const base = { rps: 50, pageP95: 3000, users: 100, measured: "test" };

test("a run within the usual variation passes quietly; a much slower one warns, in plain words", () => {
  assert.deepEqual(compareToBaseline(run(40, 4000), base), []); // -20% rate, +33% p95: normal noise
  const slow = compareToBaseline(run(30, 5400), base);
  assert.equal(slow.length, 2);
  assert.match(slow[0], /30\.0 requests a second, down from 50 \(-40%\)/);
  assert.match(slow[1], /pages take 5400 ms at p95, up from 3000 ms \(\+80%\)/);
});

test("nothing to compare: no baseline yet, or a run with a different number of users", () => {
  assert.deepEqual(compareToBaseline(run(10, 9000), null), []);
  assert.deepEqual(compareToBaseline(run(10, 9000, 40), base), []);
});

test("CI and the laptop have separate baselines, and the committed file has both keys", () => {
  assert.equal(baselineKey({ GITHUB_ACTIONS: "true" }), "ci");
  assert.equal(baselineKey({}), "local");
  const file = JSON.parse(readFileSync(new URL("../../scripts/load-baseline.json", import.meta.url), "utf8"));
  assert.ok("ci" in file && "local" in file);
  assert.match(summaryLine(run(42.56, 3000)), /^42\.6 requests a second with 100 users, 0 errors; pages p50 1500 ms, p95 3000 ms$/);
});
