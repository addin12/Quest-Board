// The limits themselves: per-IP buckets must survive carrier-grade NAT; per-account ones stay strict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "../../src/lib/limits.ts";

const perHour = (b: keyof typeof LIMITS) => LIMITS[b].limit * (3_600_000 / LIMITS[b].windowMs);

test("buckets keyed by IP alone allow at least 100 an hour (many phones share one carrier IP)", () => {
  for (const b of ["loginIp", "signup", "resetIp", "feedbackIp", "api", "twoStep"] as const) assert.ok(perHour(b) >= 100, `${b}: ${perHour(b)}/h`);
});

test("per-account buckets stay strict enough to stop guessing", () => {
  assert.ok(perHour("login") <= 60, "password tries per IP + email");
  assert.ok(LIMITS.reset.limit <= 5, "reset emails per IP + email");
  assert.ok(perHour("password") <= 20, "password changes per user");
});
