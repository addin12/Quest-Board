import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGULAR_ICONS, SOLID_ICONS } from "../../src/lib/icons.ts";
import { SYSTEMS } from "../../src/lib/validation.ts";

test("every registered icon is in the generated Flaticon subset (run `npm run icons` if this fails)", () => {
  const css = readFileSync(new URL("../../src/app/icons/icons.css", import.meta.url), "utf8");
  for (const name of REGULAR_ICONS) assert.ok(css.includes(`.fi-rr-${name}:before`), `missing fi-rr-${name}`);
  for (const name of SOLID_ICONS) assert.ok(css.includes(`.fi-sr-${name}:before`), `missing fi-sr-${name}`);
  assert.match(css, /UIcons by Flaticon/);
});

test("D&D 5e is split into the 2014 and 2024 editions", () => {
  assert.ok(SYSTEMS.includes("D&D 5e (2014)"));
  assert.ok(SYSTEMS.includes("D&D 5.5e (2024)"));
  assert.ok(!(SYSTEMS as readonly string[]).includes("D&D 5e"));
});
