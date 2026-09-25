import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, googleCalendarUrl, icsDate, icsEscape, icsFold, sessionEvent } from "../../src/lib/calendar.ts";
import { makeT } from "../../src/lib/i18n/dict.ts";

const t = makeT("en");
const session = {
  id: 7, starts_at: "2026-09-28T12:00:00.000Z", duration_minutes: 180, title: "Mercusuar di Pulau Kabut",
  system: "Call of Cthulhu", slug: "mercusuar-di-pulau-kabut", location_type: "online", platform: "Discord + Foundry VTT", city: "",
};

test("icsDate is UTC basic format", () => {
  assert.equal(icsDate(new Date("2026-09-28T12:00:00.000Z")), "20260928T120000Z");
});

test("icsEscape escapes TEXT specials", () => {
  assert.equal(icsEscape("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("icsFold keeps every physical line within 75 octets, even with multi-byte characters", () => {
  const long = "DESCRIPTION:" + "Petualangan “naga” — ".repeat(12);
  const folded = icsFold(long);
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(folded.replace(/\r\n /g, ""), long); // unfolds back to the original
});

test("sessionEvent uses public details only and the right location", () => {
  const e = sessionEvent(session, "https://questboard.id", t);
  assert.equal(e.location, "Discord + Foundry VTT");
  assert.equal(e.url, "https://questboard.id/games/mercusuar-di-pulau-kabut");
  assert.equal(e.title, "Mercusuar di Pulau Kabut (Call of Cthulhu)");
  const inPerson = sessionEvent({ ...session, location_type: "in_person", city: "Bandung" }, "https://x", t);
  assert.equal(inPerson.location, "Bandung");
});

test("buildIcs produces a valid single-event calendar with CRLF line endings", () => {
  const ics = buildIcs(sessionEvent(session, "https://questboard.id", t), new Date("2026-09-01T00:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /\r\nDTSTART:20260928T120000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260928T150000Z\r\n/); // 180 minutes later
  assert.match(ics, /\r\nUID:session-7@questboard\r\n/);
  assert.match(ics, /\r\nTRIGGER:-PT1H\r\n/); // 1-hour reminder
  assert.ok(!/\n(?<!\r\n)/.test(ics.replace(/\r\n/g, "")), "no bare LF");
});

test("googleCalendarUrl carries title, dates and location", () => {
  const u = new URL(googleCalendarUrl(sessionEvent(session, "https://questboard.id", t)));
  assert.equal(u.hostname, "calendar.google.com");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("dates"), "20260928T120000Z/20260928T150000Z");
  assert.equal(u.searchParams.get("location"), "Discord + Foundry VTT");
  assert.match(u.searchParams.get("details") ?? "", /https:\/\/questboard\.id\/games\/mercusuar/);
});
