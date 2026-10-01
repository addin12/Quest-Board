// The scheduler's watch on the app: one email after the threshold, one when it's back, nothing for blips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchStep } from "../../scripts/health-watch.mjs";

const MIN = 60_000;
const run = (checks: boolean[]) => {
  let state = { downSince: null as number | null, alerted: false, detail: "" };
  const sent: (string | null)[] = [];
  checks.forEach((healthy, i) => {
    const step = watchStep(state, healthy, i * MIN, 10 * MIN, healthy ? "" : "ECONNREFUSED");
    sent.push(step.send);
    state = step.state;
  });
  return sent;
};

test("down for 10 minutes: one email; back: one more", () => {
  const sent = run([true, ...Array(12).fill(false), true, true]);
  assert.deepEqual(sent.filter(Boolean), ["down", "up"]);
  assert.equal(sent.indexOf("down"), 11); // 10 minutes after the first failed check (minute 1)
});

test("a short blip sends nothing", () => {
  assert.deepEqual(run([true, false, false, false, true, true]).filter(Boolean), []);
});

test("down twice: two pairs of emails", () => {
  const sent = run([...Array(11).fill(false), true, ...Array(11).fill(false), true]);
  assert.deepEqual(sent.filter(Boolean), ["down", "up", "down", "up"]);
});
