// "Someone is trying to log in" emails (lib/security-mail.ts): what to do, in the person's language and time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { failedLoginsEmail } from "../../src/lib/security-mail.ts";

const person = { email: "pia@x.test", name: "Pia", locale: "en" as const, time_zone: "Asia/Makassar" };
const at = new Date("2026-10-09T11:00:00Z");

test("wrong passwords: how many, when (their time zone), and the links to change the password and see devices", () => {
  const m = failedLoginsEmail(person, { reason: "password", attempts: 5 }, "https://qb.test", at);
  assert.equal(m.to, "pia@x.test");
  assert.match(m.subject, /trying to log in/);
  assert.match(m.text, /wrong password 5 times/);
  assert.match(m.text, /19[.:]00 WITA/);
  assert.match(m.text, /https:\/\/qb\.test\/forgot-password/);
  assert.match(m.text, /https:\/\/qb\.test\/settings#devices/);
});

test("wrong codes after the right password: the stronger warning; in Indonesian", () => {
  const m = failedLoginsEmail({ ...person, locale: "id" }, { reason: "code", attempts: 3 }, "https://qb.test", at);
  assert.match(m.subject, /tahu kata sandi/);
  assert.match(m.text, /kode login dua langkah sebanyak 3 kali/);
});
