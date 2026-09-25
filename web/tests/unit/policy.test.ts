import { test } from "node:test";
import assert from "node:assert/strict";
import { canBook, canCancel, formatIdr, isOnlineLocation, normalizeLocation, parseIdr, slugify, splitList } from "../../src/lib/policy.ts";

const now = new Date("2026-10-01T12:00:00Z");
const base = {
  sessionStatus: "scheduled",
  gameStatus: "published",
  startsAt: new Date(now.getTime() + 48 * 36e5),
  now,
  seatsTotal: 5,
  seatsTaken: 2,
  isGm: false,
  alreadyBooked: false,
};

test("formatIdr uses Indonesian grouping and no decimals", () => {
  assert.equal(formatIdr(75000), "Rp 75.000");
  assert.equal(formatIdr(1250000), "Rp 1.250.000");
  assert.equal(formatIdr(0), "Rp 0");
});

test("parseIdr accepts common Indonesian input styles", () => {
  assert.equal(parseIdr("75.000"), 75000);
  assert.equal(parseIdr("Rp 75,000"), 75000);
  assert.equal(parseIdr("75000"), 75000);
  assert.equal(parseIdr(""), 0);
  assert.equal(parseIdr("abc"), null);
});

test("players can cancel only before the session starts", () => {
  assert.equal(canCancel(new Date(now.getTime() + 60_000), now), true);
  assert.equal(canCancel(now, now), false);
});

test("canBook happy path", () => {
  assert.deepEqual(canBook(base), { ok: true });
});

test("canBook rejections return translation keys", () => {
  const cases: [Partial<typeof base>, string][] = [
    [{ isGm: true }, "err.ownGame"],
    [{ gameStatus: "draft" }, "err.notAccepting"],
    [{ sessionStatus: "cancelled" }, "err.notScheduled"],
    [{ startsAt: new Date(now.getTime() - 1) }, "err.started"],
    [{ alreadyBooked: true }, "err.alreadyBooked"],
    [{ seatsTaken: 5 }, "err.full"],
  ];
  for (const [override, reason] of cases) assert.deepEqual(canBook({ ...base, ...override }), { ok: false, reason });
});

test("slugify", () => {
  assert.equal(slugify("Mercusuar di Pulau Kabut"), "mercusuar-di-pulau-kabut");
  assert.equal(slugify("  Café -- Crème!! "), "cafe-creme");
  assert.equal(slugify("!!!"), "game");
});

test("splitList trims and drops blanks", () => {
  assert.deepEqual(splitList(" a, b ,,c "), ["a", "b", "c"]);
});

test("GM location is a city or Online", () => {
  assert.equal(normalizeLocation("  Jakarta  "), "Jakarta");
  assert.equal(normalizeLocation("Kota   Bandung"), "Kota Bandung");
  assert.equal(normalizeLocation("online"), "Online");
  assert.equal(normalizeLocation("ONLINE "), "Online");
  assert.equal(normalizeLocation(""), "Online");
  assert.ok(isOnlineLocation("Online") && !isOnlineLocation("Jakarta"));
});
