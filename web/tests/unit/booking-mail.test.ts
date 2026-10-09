// The player's booking confirmation (lib/session-mail.ts): when in their own time zone, where (venue and
// map, or the platform), the price, the GM's refund terms, a calendar file — never the payment details.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingConfirmedEmail } from "../../src/lib/session-mail.ts";

const person = { email: "pia@x.test", name: "Pia", locale: "en" as const, time_zone: "Asia/Makassar" };
const session = {
  id: 42, title: "Kopi & Naga", slug: "kopi-naga", system: "D&D 5e (2014)", starts_at: "2026-10-20T11:00:00.000Z", duration_minutes: 180,
  price_idr: 50_000, gm_name: "Vina", location_type: "in_person", platform: "", city: "Bandung",
  venue_name: "Kumu Ground Coffee", venue_maps_url: "https://maps.app.goo.gl/Kumu", gm_refund_terms: "Full refund up to 24 hours before.",
};

test("an in-person booking: venue, map, price, refund terms, calendar file, in the player's time zone", () => {
  const m = bookingConfirmedEmail(person, session, "https://questboard.id");
  assert.equal(m.to, "pia@x.test");
  assert.match(m.subject, /^Seat booked: Kopi & Naga — /);
  assert.match(m.subject, /19[.:]00 WITA/); // 11:00 UTC in Makassar
  assert.match(m.text, /Where: Kumu Ground Coffee, Bandung\nMap: https:\/\/maps\.app\.goo\.gl\/Kumu/);
  assert.match(m.text, /Price: Rp 50\.000, paid directly to the GM/);
  assert.match(m.text, /refund terms:\nFull refund up to 24 hours before\./);
  assert.match(m.text, /https:\/\/questboard\.id\/api\/sessions\/42\/ics/);
  assert.match(m.text, /https:\/\/questboard\.id\/games\/kopi-naga/);
});

test("online and free, no refund terms; in Indonesian", () => {
  const m = bookingConfirmedEmail({ ...person, locale: "id" }, { ...session, location_type: "online", platform: "Discord", price_idr: 0, gm_refund_terms: null }, "https://questboard.id");
  assert.match(m.subject, /^Kursi dipesan: /);
  assert.match(m.text, /Tempat: Online \(Discord\)\. Tautan untuk masuk ada di halaman game\./);
  assert.match(m.text, /Harga: Gratis/);
  assert.doesNotMatch(m.text, /refund/i);
  assert.doesNotMatch(m.text, /Kumu/);
});
