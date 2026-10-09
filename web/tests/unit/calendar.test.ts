import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIcs, buildIcsFeed, googleCalendarUrl, icsDate, icsEscape, icsFold, sessionEvent } from "../../src/lib/calendar.ts";
import { makeT } from "../../src/lib/i18n/dict.ts";
import { parseRepeat, weeklyStarts, MAX_REPEAT_WEEKS } from "../../src/lib/validation.ts";

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
  // With a venue (v39): the venue and city as the location (phones offer directions), the map link in the notes.
  const venue = sessionEvent({ ...session, location_type: "in_person", city: "Bandung", venue_name: "Kumu Ground Coffee", venue_maps_url: "https://maps.app.goo.gl/Kumu" }, "https://x", t);
  assert.equal(venue.location, "Kumu Ground Coffee, Bandung");
  assert.match(venue.description, /Open in Google Maps: https:\/\/maps\.app\.goo\.gl\/Kumu/);
  assert.match(buildIcs(venue), /\r\nLOCATION:Kumu Ground Coffee\\, Bandung\r\n/);
  assert.match(googleCalendarUrl(venue), /location=Kumu\+Ground\+Coffee%2C\+Bandung/);
});

test("buildIcs produces a valid single-event calendar with CRLF line endings", () => {
  const ics = buildIcs(sessionEvent(session, "https://questboard.id", t), new Date("2026-09-01T00:00:00Z"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /\r\nDTSTART:20260928T120000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260928T150000Z\r\n/); // 180 minutes later
  assert.match(ics, /\r\nUID:session-7@questboard\r\n/);
  assert.match(ics, /\r\nTRIGGER:-PT1H\r\n/); // 1-hour reminder
  assert.match(ics, /\r\nSEQUENCE:0\r\n/);
  // A session whose time the GM changed twice: calendars take the update because SEQUENCE went up.
  assert.match(buildIcs(sessionEvent({ ...session, reschedule_count: 2 }, "https://questboard.id", t)), /\r\nSEQUENCE:2\r\n/);
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

test("weekly series: parseRepeat clamps, weeklyStarts steps 7 days", () => {
  assert.equal(parseRepeat("4"), 4);
  assert.equal(parseRepeat("0"), 1);
  assert.equal(parseRepeat("99"), MAX_REPEAT_WEEKS);
  assert.equal(parseRepeat("abc"), 1);
  const first = new Date("2026-10-03T12:00:00.000Z");
  const s = weeklyStarts(first, 3).map((d) => d.toISOString());
  assert.deepEqual(s, ["2026-10-03T12:00:00.000Z", "2026-10-10T12:00:00.000Z", "2026-10-17T12:00:00.000Z"]);
});

test("buildIcsFeed: many events, a calendar name for subscriptions, cancelled events marked", () => {
  const base = { minutes: 180, description: "d", location: "Online", url: "https://qb.test/games/x" };
  const ics = buildIcsFeed([
    { ...base, uid: "session-1@questboard", start: new Date("2026-10-03T12:00:00Z"), title: "One" },
    { ...base, uid: "session-2@questboard", start: new Date("2026-10-10T12:00:00Z"), title: "Two", cancelled: true },
  ], "Quest Board sessions", new Date("2026-09-26T00:00:00Z"));
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
  assert.match(ics, /X-WR-CALNAME:Quest Board sessions\r\n/);
  assert.match(ics, /UID:session-2@questboard\r\n[\s\S]*?STATUS:CANCELLED\r\nEND:VEVENT/);
  assert.equal(ics.match(/BEGIN:VALARM/g)?.length, 1); // no reminder for the cancelled one
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});
