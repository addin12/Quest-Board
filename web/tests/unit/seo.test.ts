import { test } from "node:test";
import assert from "node:assert/strict";
import { disallowedPaths, gameEventsJsonLd, jsonLdString, languageAlternates, localizedPath, NO_INDEX_PATHS, unprefixedPath, type EventGame } from "../../src/lib/seo.ts";

type Ev = {
  "@type": string; endDate: string; eventAttendanceMode: string; remainingAttendeeCapacity: number; image?: string[];
  location: { "@type": string; name?: string; url?: string; hasMap?: string; address?: { addressLocality: string } }; offers: { availability: string };
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

test("in-person games give the venue (or the city) and its map; full sessions are sold out; at most 10 events", () => {
  const offline = { ...game, location_type: "in_person" as const, city: "Bandung" };
  const [e] = gameEventsJsonLd(offline, [{ ...session, seats_taken: 5 }], "https://qb.test") as Ev[];
  assert.equal(e.location.name, "Bandung");
  assert.equal(e.location.hasMap, undefined);
  assert.equal(e.location.address?.addressLocality, "Bandung");
  const [v] = gameEventsJsonLd({ ...offline, venue_name: "Kumu Ground Coffee", venue_maps_url: "https://maps.app.goo.gl/Kumu" }, [session], "https://qb.test") as Ev[];
  assert.equal(v.location.name, "Kumu Ground Coffee");
  assert.equal(v.location.hasMap, "https://maps.app.goo.gl/Kumu");
  assert.equal(v.location.address?.addressLocality, "Bandung");
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

test("structured data for the other public pages: site + search box, lists, GM profile, FAQ, breadcrumbs", async () => {
  const { websiteJsonLd, collectionJsonLd, gmProfileJsonLd, faqJsonLd, breadcrumbJsonLd, webPageJsonLd } = await import("../../src/lib/seo.ts");
  const [site, org] = websiteJsonLd("https://qb.test", "id", "Cari game") as { "@type": string; inLanguage?: string; potentialAction?: { target: string } }[];
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.inLanguage, "id-ID");
  assert.equal(site.potentialAction?.target, "https://qb.test/games?q={search_term_string}");
  assert.equal(org["@type"], "Organization");

  const list = collectionJsonLd({ name: "Games", description: "d", url: "https://qb.test/games" }, [{ title: "Naga", slug: "naga" }], "https://qb.test") as { mainEntity: { numberOfItems: number; itemListElement: { url: string; position: number }[] } };
  assert.equal(list.mainEntity.numberOfItems, 1);
  assert.deepEqual(list.mainEntity.itemListElement[0], { "@type": "ListItem", position: 1, name: "Naga", url: "https://qb.test/games/naga" });

  const gm = { id: 7, name: "Raka", headline: "Horror GM", bio: "", avatar_image: "/uploads/a.webp", avg_rating: 4.8, review_count: 12 };
  const profile = gmProfileJsonLd(gm, "https://qb.test") as { "@type": string; mainEntity: { image?: string; aggregateRating?: { ratingValue: number; reviewCount: number } } };
  assert.equal(profile["@type"], "ProfilePage");
  assert.equal(profile.mainEntity.image, "https://qb.test/uploads/a.webp");
  assert.deepEqual([profile.mainEntity.aggregateRating?.ratingValue, profile.mainEntity.aggregateRating?.reviewCount], [4.8, 12]);
  const newGm = gmProfileJsonLd({ ...gm, avatar_image: "", avg_rating: null, review_count: 0 }, "https://qb.test") as { mainEntity: object };
  assert.ok(!("aggregateRating" in newGm.mainEntity) && !("image" in newGm.mainEntity)); // no rating before any review

  const faq = faqJsonLd([{ q: "How do I pay?", a: "Directly to the GM." }]) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "Directly to the GM.");
  const crumbs = breadcrumbJsonLd([{ name: "Quest Board", url: "https://qb.test" }, { name: "Naga", url: "https://qb.test/games/naga" }]) as { itemListElement: { position: number; item: string }[] };
  assert.deepEqual(crumbs.itemListElement.map((c) => c.position), [1, 2]);
  assert.equal((webPageJsonLd({ name: "How", description: "d", url: "u" }) as { "@type": string })["@type"], "WebPage");
  assert.ok(!jsonLdString(faqJsonLd([{ q: "</script>", a: "x" }])).includes("<"));
});
