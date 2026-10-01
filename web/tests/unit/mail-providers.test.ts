// Which email providers are used, in what order, and how the daily limits are shared out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { configuredProviders, hasRoom, parseFrom, redirectedProvider } from "../../src/lib/mail-providers.ts";

const from = "Quest Board <halo@questboard.id>";

test("Resend first, then Brevo; nothing without a sender address", () => {
  assert.deepEqual(configuredProviders({ RESEND_API_KEY: "re", BREVO_API_KEY: "b", QUESTBOARD_MAIL_FROM: from }).map((p) => [p.id, p.limit]), [["resend", 100], ["brevo", 300]]);
  assert.deepEqual(configuredProviders({ BREVO_API_KEY: "b", QUESTBOARD_MAIL_FROM: from }).map((p) => p.id), ["brevo"]);
  assert.deepEqual(configuredProviders({ RESEND_API_KEY: "re", BREVO_API_KEY: "b" }), []);
  // A plan's own limit; 0 = none; nonsense falls back to the free plan's.
  const limits = configuredProviders({ RESEND_API_KEY: "re", BREVO_API_KEY: "b", QUESTBOARD_MAIL_FROM: from, RESEND_DAILY_LIMIT: "0", BREVO_DAILY_LIMIT: "lots" });
  assert.deepEqual(limits.map((p) => p.limit), [0, 300]);
});

test("the rehearsal's stand-ins are spotted", () => {
  assert.equal(redirectedProvider(configuredProviders({ RESEND_API_KEY: "re", QUESTBOARD_MAIL_FROM: from })), undefined);
  assert.equal(redirectedProvider(configuredProviders({ RESEND_API_KEY: "re", QUESTBOARD_MAIL_FROM: from, QUESTBOARD_RESEND_URL: "https://api.resend.com/" })), undefined);
  assert.equal(redirectedProvider(configuredProviders({ BREVO_API_KEY: "b", QUESTBOARD_MAIL_FROM: from, QUESTBOARD_BREVO_URL: "http://fakes:4000" }))?.id, "brevo");
});

test("optional emails leave the last 20% of a limit to important ones", () => {
  const free = { limit: 100 };
  assert.equal(hasRoom(free, 79, true), true);
  assert.equal(hasRoom(free, 80, true), false); // a reminder waits…
  assert.equal(hasRoom(free, 80, false), true); // …a password reset still goes
  assert.equal(hasRoom(free, 99, false), true);
  assert.equal(hasRoom(free, 100, false), false);
  assert.equal(hasRoom({ limit: 0 }, 10_000, true), true); // no limit
});

test("the sender is split for Brevo", () => {
  assert.deepEqual(parseFrom(from), { name: "Quest Board", email: "halo@questboard.id" });
  assert.deepEqual(parseFrom('"Quest Board" <halo@questboard.id>'), { name: "Quest Board", email: "halo@questboard.id" });
  assert.deepEqual(parseFrom("halo@questboard.id"), { email: "halo@questboard.id" });
});
