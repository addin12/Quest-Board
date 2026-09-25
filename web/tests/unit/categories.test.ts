import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  GENRES, MAX_PER_GAME, STYLES, SYSTEM_BLURBS, genreDescKey, genreLabelKey, normalizeCategories,
  parseCategoryCsv, styleDescKey, styleLabelKey, systemDescKey, systemSlug,
} from "../../src/lib/categories.ts";
import { DICTIONARIES } from "../../src/lib/i18n/dict.ts";
import { MIGRATIONS } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";
import { SYSTEMS } from "../../src/lib/validation.ts";
import { parseGmRequest, parseOffer, parseProfile } from "../../src/lib/validation.ts";

test("normalizeCategories keeps known keys, dedupes, keeps taxonomy order and caps", () => {
  assert.equal(normalizeCategories(["horror", "fantasy", "horror", "nope"], "genre"), "fantasy,horror");
  assert.equal(normalizeCategories("sci-fi,cozy", "genre"), "sci-fi,cozy");
  assert.equal(normalizeCategories(["tactical", "horror"], "style"), "tactical"); // a genre is not a style
  const all = GENRES.map((g) => g.key);
  assert.equal(parseCategoryCsv(normalizeCategories(all, "genre")).length, MAX_PER_GAME);
  assert.equal(normalizeCategories([], "genre"), "");
  assert.deepEqual(parseCategoryCsv(""), []);
});

test("systemSlug is URL-safe and every known system slug is unique", () => {
  assert.equal(systemSlug("D&D 5.5e (2024)"), "dnd-5-5e-2024");
  assert.equal(systemSlug("D&D 5e (2014)"), "dnd-5e-2014");
  assert.equal(systemSlug("Call of Cthulhu"), "call-of-cthulhu");
  const slugs = SYSTEMS.map(systemSlug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
  // Every blurb slug belongs to a real system.
  for (const b of SYSTEM_BLURBS) assert.ok(slugs.includes(b), `blurb for unknown system ${b}`);
});

test("every category and system blurb has a label in both languages", () => {
  const keys = [
    ...GENRES.flatMap((g) => [genreLabelKey(g.key), genreDescKey(g.key)]),
    ...STYLES.flatMap((s) => [styleLabelKey(s.key), styleDescKey(s.key)]),
    ...SYSTEM_BLURBS.map((s) => systemDescKey(s)!),
  ];
  for (const lang of ["en", "id"] as const)
    for (const k of keys) assert.ok(DICTIONARIES[lang][k], `${lang} is missing ${k}`);
  assert.equal(systemDescKey("not-a-system"), null);
});

test("parseGmRequest validates the request form", () => {
  const good = {
    title: "Horror one-shot for 4", system: "Call of Cthulhu", groupSize: "4", experienceLevel: "beginner",
    language: "id", locationType: "online", schedule: "Saturday 19.00", budget: "Rp 60.000",
    details: "Four friends from the office, all new to TTRPGs.",
  };
  const ok = parseGmRequest(good);
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.value.budgetIdr, 60000);
    assert.equal(ok.value.groupSize, 4);
  }
  const bad = parseGmRequest({ ...good, title: "x", groupSize: "20", schedule: "", details: "short", locationType: "in_person", city: "" });
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.equal(bad.errors.title, "v.requestTitle");
    assert.equal(bad.errors.groupSize, "v.groupSize");
    assert.equal(bad.errors.schedule, "v.schedule");
    assert.equal(bad.errors.details, "v.requestDetails");
    assert.equal(bad.errors.city, "v.city");
  }
  // Budget is optional.
  const noBudget = parseGmRequest({ ...good, budget: "" });
  assert.ok(noBudget.ok && noBudget.value.budgetIdr === 0);
});

test("parseOffer and parseProfile", () => {
  assert.ok(parseOffer({ message: "Happy to run this for you!", price: "75.000" }).ok);
  const bad = parseOffer({ message: "hi", price: "abc" });
  assert.ok(!bad.ok && bad.errors.message === "v.offerMessage" && bad.errors.price === "v.price");
  assert.ok(parseProfile({ name: "Sari", bio: "" }).ok);
  const badP = parseProfile({ name: "S", bio: "x".repeat(2001) });
  assert.ok(!badP.ok && badP.errors.name === "v.name" && badP.errors.bio === "v.bioLong");
});

test("migration 7 back-fills demo categories without touching GM-edited games", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  db.exec(`DROP TABLE notifications; ALTER TABLE games DROP COLUMN genres; ALTER TABLE games DROP COLUMN styles;
    DROP TABLE gm_request_messages; DROP TABLE gm_request_offers; DROP TABLE gm_requests;`);
  db.exec("INSERT INTO users (id, email, password_hash, name) VALUES (1, 'gm@x.test', 'x', 'GM')");
  const ins = db.prepare(`INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, price_idr, seats_total)
    VALUES (1, ?, 't', 'Call of Cthulhu', 's', 'd', 'one_shot', 'online', 0, 4)`);
  ins.run("mercusuar-di-pulau-kabut");
  ins.run("my-own-game");
  db.exec(MIGRATIONS[7]);
  const rows = db.prepare("SELECT slug, genres, styles FROM games ORDER BY id").all() as { slug: string; genres: string; styles: string }[];
  assert.equal(rows[0].genres, "horror,mystery");
  assert.equal(rows[0].styles, "roleplay-heavy,puzzle-mystery");
  assert.equal(rows[1].genres, "");
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
  for (const t of ["gm_requests", "gm_request_offers", "gm_request_messages"]) assert.ok(tables.includes(t));
});
