// In-person games name their venue and link it on Google Maps (v39). The link is shown to everyone as
// "Open in Google Maps", so only real Google Maps addresses are accepted.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isGoogleMapsUrl, parseGame } from "../../src/lib/validation.ts";

test("Google Maps share links and google.com/maps addresses pass; anything else doesn't", () => {
  for (const ok of [
    "https://maps.app.goo.gl/AbC123xyz",
    "https://www.google.com/maps/place/Kumu+Ground+Coffee/@-6.9,107.6,17z",
    "https://goo.gl/maps/xyz",
    "https://maps.google.co.id/?q=Braga",
    "https://www.google.co.id/maps/search/?api=1&query=Braga",
  ]) assert.equal(isGoogleMapsUrl(ok), true, ok);
  for (const bad of [
    "http://maps.app.goo.gl/x", // not https
    "https://maps.app.goo.gl/", // no place
    "https://evil.com/maps",
    "https://www.google.com/search?q=x", // Google, but not Maps
    "https://google.com.evil.io/maps/x",
    "https://maps.app.goo.gl.evil.com/x",
    "https://user@maps.app.goo.gl/x",
    "javascript:alert(1)",
    "https://maps.app.goo.gl/x\"><script>",
  ]) assert.equal(isGoogleMapsUrl(bad), false, bad);
});

const base = {
  title: "Kopi & Naga", system: "D&D 5e (2014)", summary: "A cosy one-shot at a café.", description: "A long enough description for a game at a café.",
  format: "one_shot", language: "id", price: "50.000", seatsTotal: "5", minAge: "13", experienceLevel: "any",
};

test("an in-person game keeps its venue; an online one drops it; a bad link is refused", () => {
  const inPerson = parseGame({ ...base, locationType: "in_person", city: "Bandung", venueName: "Kumu Ground Coffee", venueMapsUrl: "https://maps.app.goo.gl/AbC123" });
  assert.ok(inPerson.ok);
  assert.equal(inPerson.value.venueName, "Kumu Ground Coffee");
  assert.equal(inPerson.value.venueMapsUrl, "https://maps.app.goo.gl/AbC123");

  const online = parseGame({ ...base, locationType: "online", platform: "Discord", venueName: "Kumu", venueMapsUrl: "https://maps.app.goo.gl/AbC123" });
  assert.ok(online.ok);
  assert.equal(online.value.venueName, "");
  assert.equal(online.value.venueMapsUrl, "");

  const bad = parseGame({ ...base, locationType: "in_person", city: "Bandung", venueMapsUrl: "https://bit.ly/cafe" });
  assert.ok(!bad.ok);
  assert.equal(bad.errors.venueMapsUrl, "v.venueMaps");
  assert.equal(parseGame({ ...base, locationType: "in_person", city: "Bandung", venueName: "x".repeat(101) }).ok, false);
});
