import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGame, parseReview, parseSessionStart, parseSignup } from "../../src/lib/validation.ts";
import { hashPassword, verifyPassword, hashToken } from "../../src/lib/password.ts";

const validGame = {
  title: "Signal from Tartarus",
  system: "Mothership",
  summary: "A short sci-fi horror one-shot.",
  description: "A long enough description of the game so that validation passes happily.",
  format: "one_shot",
  locationType: "online",
  platform: "Discord",
  price: "60000",
  seatsTotal: "5",
  minAge: "18",
};

test("parseSignup accepts valid input and normalises email", () => {
  const r = parseSignup({ name: "Alex", email: "  Alex@Example.COM ", password: "longenough", role: "gm" });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.email, "alex@example.com");
    assert.equal(r.value.role, "gm");
  }
});

test("parseSignup rejects bad input", () => {
  const r = parseSignup({ name: "A", email: "nope", password: "short" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["email", "name", "password"]);
});

test("parseSignup defaults unknown roles to player (no self-promotion to admin)", () => {
  const r = parseSignup({ name: "Mallory", email: "m@x.io", password: "longenough", role: "admin" });
  assert.ok(r.ok && r.value.role === "player");
});

test("parseGame reads Rupiah prices in Indonesian format", () => {
  const r = parseGame({ ...validGame, price: "75.000" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.priceIdr, 75000);
  const free = parseGame({ ...validGame, price: "" });
  assert.ok(free.ok && free.value.priceIdr === 0);
});

test("parseGame defaults play language to Indonesian", () => {
  const r = parseGame(validGame);
  assert.ok(r.ok && r.value.language === "id");
  const both = parseGame({ ...validGame, language: "both" });
  assert.ok(both.ok && both.value.language === "both");
});

test("validation errors are translation keys", () => {
  const r = parseSignup({ name: "A", email: "x", password: "y" });
  assert.ok(!r.ok && r.errors.name === "v.name" && r.errors.email === "v.email");
});

test("parseGame requires platform for online and city for in-person", () => {
  const online = parseGame({ ...validGame, platform: "" });
  assert.ok(!online.ok && "platform" in online.errors);
  const inPerson = parseGame({ ...validGame, locationType: "in_person", city: "" });
  assert.ok(!inPerson.ok && "city" in inPerson.errors);
});

test("parseGame enforces seat and price bounds", () => {
  const r = parseGame({ ...validGame, seatsTotal: "13", price: "10.000.001" });
  assert.ok(!r.ok && "seatsTotal" in r.errors && "price" in r.errors);
});

test("parseSessionStart converts local wall-clock time to UTC using the browser offset", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  // 19:00 in UTC-5 (offset +300) is 00:00 UTC next day.
  const r = parseSessionStart("2026-03-10T19:00", "300", now);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.toISOString(), "2026-03-11T00:00:00.000Z");
});

test("parseSessionStart rejects past dates and garbage", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(parseSessionStart("2025-12-31T10:00", "0", now).ok, false);
  assert.equal(parseSessionStart("tomorrow", "0", now).ok, false);
});

test("parseReview", () => {
  assert.ok(parseReview({ rating: "5", body: "Great" }).ok);
  assert.equal(parseReview({ rating: "6" }).ok, false);
  assert.equal(parseReview({ rating: "0" }).ok, false);
});

test("password hashing round-trips and rejects wrong passwords", () => {
  const h = hashPassword("correct horse");
  assert.ok(verifyPassword("correct horse", h));
  assert.ok(!verifyPassword("wrong horse", h));
  assert.ok(!verifyPassword("x", "garbage"));
  assert.notEqual(hashPassword("same"), hashPassword("same")); // salted
});

test("token hashing is deterministic", () => {
  assert.equal(hashToken("abc"), hashToken("abc"));
  assert.equal(hashToken("abc").length, 64);
});
