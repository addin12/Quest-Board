import { test } from "node:test";
import assert from "node:assert/strict";
import { disallowedPaths, gameEventsJsonLd, jsonLdString, languageAlternates, localizedPath, NO_INDEX_PATHS, unprefixedPath, type EventGame } from "../../src/lib/seo.ts";

type Ev = {
  "@type": string; endDate: string; eventAttendanceMode: string; remainingAttendeeCapacity: number; image?: string[];
  location: { "@type": string; url?: string; address?: { addressLocality: string } }; offers: { availability: string };
};

const game: EventGame = {
  slug: "naga", title: "Naga", summary: "A one-shot", system: "D&D 5e", location_type: "online", city: "",
  price_idr: 50000, seats_total: 5, cover_image: "/images/covers/naga.svg", gm_id: 7, gm_name: "Raka",
};
const session = { id: 3, starts_at: "2026-10-03T12:00:00.000Z", duration_minutes: 180, seats_taken: 2, seats_held: 1 };

test("one Event per session with public details, price in IDR and remaining seats", () => {
  const [e] = gameEventsJsonLd(game, [session], "https://qb.test") as Ev[];
  assert.equal(e["@type"], "Event");
  assert.equal(e.endDate, "2026-10-03T15:00:00.000Z");
  assert.equal(e.eventAttendanceMode, "https://schema.org/OnlineEventAttendanceMode");
  assert.deepEqual(e.location, { "@type": "VirtualLocation", url: "https://qb.test/games/naga" });
  assert.deepEqual(e.offers, { "@type": "Offer", url: "https://qb.test/games/naga", price: 50000, priceCurrency: "IDR", availability: "https://schema.org/InStock" });
  assert.equal(e.remainingAttendeeCapacity, 2);
  assert.deepEqual(e.image, ["https://qb.test/images/covers/naga.svg"]);
});

test("in-person games give only the city; full sessions are sold out; at most 10 events", () => {
  const offline = { ...game, location_type: "in_person" as const, city: "Bandung" };
  const [e] = gameEventsJsonLd(offline, [{ ...session, seats_taken: 5 }], "https://qb.test") as Ev[];
  assert.equal(e.location.address?.addressLocality, "Bandung");
  assert.equal(e.offers.availability, "https://schema.org/SoldOut");
  assert.equal(e.remainingAttendeeCapacity, 0);
  assert.equal(gameEventsJsonLd(game, Array.from({ length: 14 }, (_, i) => ({ ...session, id: i })), "x").length, 10);
});

test("JSON-LD can't break out of its script tag; private pages are kept out of search", () => {
  assert.ok(!jsonLdString({ t: "</script><script>alert(1)</script>" }).includes("<"));
  for (const p of ["/dashboard", "/admin", "/settings", "/api/"]) assert.ok(NO_INDEX_PATHS.includes(p));
  assert.ok(!NO_INDEX_PATHS.some((p) => "/gms/1".startsWith(p) || "/games/naga".startsWith(p)));
});

test("language URLs: prefixes are stripped and added; hreflang lists both languages, private pages get none", () => {
  assert.equal(unprefixedPath("/id/games/naga"), "/games/naga");
  assert.equal(unprefixedPath("/en"), "/");
  assert.equal(unprefixedPath("/idea"), "/idea"); // only a whole segment counts
  assert.equal(localizedPath("/", "id"), "/id");
  assert.deepEqual(languageAlternates("/id/games/naga", "id"), {
    canonical: "/id/games/naga",
    languages: { en: "/en/games/naga", id: "/id/games/naga", "x-default": "/games/naga" },
  });
  assert.equal(languageAlternates("/games/naga", "en")?.canonical, "/en/games/naga");
  assert.equal(languageAlternates("/id/dashboard", "id"), undefined);
  assert.ok(disallowedPaths().includes("/id/dashboard") && disallowedPaths().includes("/en/admin"));
});
