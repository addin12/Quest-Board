// Emails in the reader's time zone: Indonesia's three zones by their names, others by Intl's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatMoment, formatWhen, isValidTimeZone, timeZoneOr, zoneLabel } from "../../src/lib/time-zones.ts";
import { movedEmail } from "../../src/lib/session-mail.ts";

const SAT_19_WIB = "2026-10-03T12:00:00.000Z";

test("session times read WIB, WITA or WIT for Indonesian readers", () => {
  assert.equal(formatWhen(SAT_19_WIB, "en"), "Sat 3 Oct, 19.00 WIB");
  assert.equal(formatWhen(SAT_19_WIB, "id", "Asia/Jakarta"), "Sab, 3 Okt, 19.00 WIB");
  assert.equal(formatWhen(SAT_19_WIB, "id", "Asia/Makassar"), "Sab, 3 Okt, 20.00 WITA");
  assert.equal(formatWhen(SAT_19_WIB, "en", "Asia/Jayapura"), "Sat 3 Oct, 21.00 WIT");
  assert.equal(zoneLabel("Asia/Pontianak", "id"), "WIB");
  assert.match(formatWhen(SAT_19_WIB, "en", "Europe/Amsterdam"), /^Sat 3 Oct, 14\.00 (CEST|GMT\+2)$/); // elsewhere: Intl's name
  assert.equal(formatWhen(SAT_19_WIB, "en", "Not/AZone"), "Sat 3 Oct, 19.00 WIB"); // bad value → WIB
  assert.match(formatMoment(new Date(SAT_19_WIB), "en", "Asia/Makassar"), /20:00 WITA$/);
});

test("only real zone names are accepted", () => {
  for (const tz of ["Asia/Jakarta", "Asia/Makassar", "America/Argentina/Buenos_Aires", "Etc/GMT+7"]) assert.ok(isValidTimeZone(tz), tz);
  for (const tz of ["", "Mars/Olympus", "Asia/Jakarta; DROP TABLE users", "a".repeat(80), 7, null]) assert.equal(isValidTimeZone(tz), false, String(tz));
  assert.equal(timeZoneOr(undefined), "Asia/Jakarta");
});

test("a moved-session email uses the player's zone", () => {
  const mail = movedEmail(
    { email: "p@x.test", name: "Putu", locale: "id", time_zone: "Asia/Makassar" },
    { title: "Naga", slug: "naga" }, { starts_at: SAT_19_WIB }, { starts_at: "2026-10-03T13:00:00.000Z", duration_minutes: 180 }, "https://qb.test",
  );
  assert.match(mail.subject, /21\.00 WITA/);
  assert.match(mail.text, /Sebelumnya: Sab, 3 Okt, 20\.00 WITA/);
});
