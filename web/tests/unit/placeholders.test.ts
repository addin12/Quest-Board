import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  COVER_ART, COVER_LIBRARY, GM_PORTRAITS, PORTRAIT_LIBRARY,
  coverPath, isAllowedCover, isAllowedPortrait, libraryCoverPath, libraryPortraitPath, portraitPath,
} from "../../src/lib/placeholders.ts";
import { MIGRATIONS } from "../../src/lib/migrations.ts";
import { SCHEMA_SQL } from "../../src/lib/schema.ts";

const publicFile = (p: string) => new URL(`../../public${p}`, import.meta.url);

test("every placeholder in the manifest has a generated SVG (run `npm run placeholders` if this fails)", () => {
  for (const slug of Object.keys(COVER_ART)) {
    const f = publicFile(coverPath(slug));
    assert.ok(existsSync(f), `missing cover for ${slug}`);
    assert.match(readFileSync(f, "utf8"), /^<svg[^>]+viewBox="0 0 960 1200"/);
  }
  for (const { key } of Object.values(GM_PORTRAITS)) {
    assert.ok(existsSync(publicFile(portraitPath(key))), `missing portrait ${key}`);
  }
});

test("placeholder SVGs are static art: no scripts or external references", () => {
  for (const slug of Object.keys(COVER_ART)) {
    const svg = readFileSync(publicFile(coverPath(slug)), "utf8");
    assert.doesNotMatch(svg, /<script|href=|xlink:href|url\((?!#)/i, slug);
  }
});

test("migration v6 adds image columns and assigns art to existing demo rows only", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA_SQL);
  // Rebuild the pre-v6 shape: drop the new columns.
  db.exec("ALTER TABLE games DROP COLUMN cover_image; ALTER TABLE users DROP COLUMN avatar_image;");
  db.exec("INSERT INTO users (email, password_hash, name, role) VALUES ('gm@questboard.test','x','Raka','gm'), ('someone@else.test','x','Other','gm')");
  db.exec(`INSERT INTO games (gm_id, slug, title, system, summary, description, format, location_type, price_idr, seats_total)
           VALUES (1,'mercusuar-di-pulau-kabut','M','CoC','s','d','one_shot','online',0,5), (2,'my-own-game','X','CoC','s','d','one_shot','online',0,5)`);
  db.exec(MIGRATIONS[6]);
  const covers = db.prepare("SELECT slug, cover_image FROM games ORDER BY id").all() as { slug: string; cover_image: string }[];
  assert.equal(covers[0].cover_image, "/images/covers/mercusuar-di-pulau-kabut.svg");
  assert.equal(covers[1].cover_image, ""); // user-created games keep the gradient fallback
  const avatars = db.prepare("SELECT email, avatar_image FROM users ORDER BY id").all() as { avatar_image: string }[];
  assert.equal(avatars[0].avatar_image, "/images/gms/raka.svg");
  assert.equal(avatars[1].avatar_image, "");
});

test("every cover-library motif has an illustration file", () => {
  for (const { motif } of COVER_LIBRARY) {
    const f = publicFile(libraryCoverPath(motif));
    assert.ok(existsSync(f), `missing library cover ${motif}`);
    assert.doesNotMatch(readFileSync(f, "utf8"), /<script|href=/i);
  }
});

test("isAllowedCover only accepts gradient, library art, or the game's current cover", () => {
  assert.ok(isAllowedCover(""));
  assert.ok(isAllowedCover(libraryCoverPath("neon-city")));
  assert.ok(isAllowedCover("/images/covers/panen-harapan.svg", "/images/covers/panen-harapan.svg")); // keep demo art
  assert.ok(!isAllowedCover("/images/covers/panen-harapan.svg")); // can't borrow another game's demo art
  assert.ok(!isAllowedCover("https://evil.example/x.png"));
  assert.ok(!isAllowedCover("javascript:alert(1)"));
  assert.ok(!isAllowedCover("/images/covers/library/../../secret.svg"));
});

test("every portrait-library entry has a script-free SVG, with unique keys", () => {
  const keys = new Set<string>();
  for (const { key } of PORTRAIT_LIBRARY) {
    assert.ok(!keys.has(key), `duplicate portrait key ${key}`);
    keys.add(key);
    const f = publicFile(libraryPortraitPath(key));
    assert.ok(existsSync(f), `missing library portrait ${key}`);
    assert.doesNotMatch(readFileSync(f, "utf8"), /<script|href=/i);
  }
});

test("isAllowedPortrait only accepts initials, library portraits, or the current portrait", () => {
  assert.ok(isAllowedPortrait(""));
  assert.ok(isAllowedPortrait(libraryPortraitPath("wizard-violet")));
  assert.ok(isAllowedPortrait("/images/gms/raka.svg", "/images/gms/raka.svg")); // keep own demo portrait
  assert.ok(!isAllowedPortrait("/images/gms/raka.svg")); // can't take another GM's portrait
  assert.ok(!isAllowedPortrait("https://evil.example/me.png"));
});
