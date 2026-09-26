import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, earningsCsv, summarizeEarnings, wibMonth, type EarningRow } from "../../src/lib/earnings.ts";

const row = (over: Partial<EarningRow>): EarningRow => ({
  booking_id: 1, price_idr: 50000, paid: 0, session_id: 1, starts_at: "2026-09-10T12:00:00Z", game_id: 1, title: "Naga", player_name: "Sari", ...over,
});
const now = new Date("2026-09-26T00:00:00Z");

test("months are counted in WIB (a session at 20:00 UTC on the 30th is next month in Jakarta)", () => {
  assert.equal(wibMonth("2026-09-30T20:00:00Z"), "2026-10");
  assert.equal(wibMonth("2026-09-30T16:59:00Z"), "2026-09");
});

test("summary: past months, upcoming, and priced unpaid seats to follow up", () => {
  const e = summarizeEarnings([
    row({ booking_id: 1, session_id: 1, starts_at: "2026-08-15T12:00:00Z", paid: 1 }),
    row({ booking_id: 2, session_id: 1, starts_at: "2026-08-15T12:00:00Z", paid: 0, player_name: "Ben" }),
    row({ booking_id: 3, session_id: 2, starts_at: "2026-09-10T12:00:00Z", paid: 1 }),
    row({ booking_id: 4, session_id: 3, starts_at: "2026-09-12T12:00:00Z", price_idr: 0 }), // free: nothing to chase
    row({ booking_id: 5, session_id: 4, starts_at: "2026-10-03T12:00:00Z" }),              // upcoming
    row({ booking_id: 6, session_id: 4, starts_at: "2026-10-03T12:00:00Z" }),
  ], now);
  assert.deepEqual(e.months.map((m) => [m.month, m.sessions, m.seats, m.expected, m.paid]), [
    ["2026-09", 2, 2, 50000, 50000],
    ["2026-08", 1, 2, 100000, 50000],
  ]);
  assert.deepEqual(e.upcoming, { sessions: 1, seats: 2, expected: 100000 });
  assert.deepEqual(e.unpaid.map((r) => r.player_name), ["Ben"]);
  assert.equal(e.outstanding, 50000);
  assert.equal(e.thisMonth.month, "2026-09");
  assert.deepEqual(summarizeEarnings([], now).thisMonth, { month: "2026-09", sessions: 0, seats: 0, expected: 0, paid: 0 });
});

test("CSV: quoted cells, spreadsheet formulas neutralised, UTF-8 BOM, WIB times", () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell("-1+2"), '"\'-1+2"');
  assert.equal(csvCell(50000), '"50000"');
  const csv = earningsCsv([row({ player_name: "@evil", paid: 1 })]);
  assert.ok(csv.startsWith("﻿session_start_wib,game,player,price_idr,marked_paid\r\n"));
  assert.match(csv, /"2026-09-10 19:00","Naga","'@evil","50000","yes"\r\n$/);
});
