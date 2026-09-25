import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANG, DICTIONARIES, LANGS, makeT } from "../../src/lib/i18n/dict.ts";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("Indonesian and English have identical key sets with no empty strings", () => {
  const en = Object.keys(DICTIONARIES.en).sort();
  const id = Object.keys(DICTIONARIES.id).sort();
  assert.deepEqual(id, en);
  for (const lang of ["en", "id"] as const)
    for (const [k, v] of Object.entries(DICTIONARIES[lang])) assert.ok(v.trim().length > 0, `${lang}:${k} is empty`);
});

test("placeholders match between languages", () => {
  for (const [k, enStr] of Object.entries(DICTIONARIES.en)) {
    const idStr = DICTIONARIES.id[k as keyof typeof DICTIONARIES.en];
    assert.deepEqual([...new Set(placeholders(idStr))], [...new Set(placeholders(enStr))], `placeholder mismatch in ${k}`);
  }
});

test("makeT interpolates and pluralises", () => {
  const en = makeT("en");
  const id = makeT("id");
  assert.equal(en("card.seatsLeft", { n: 1 }), "1 seat left");
  assert.equal(en("card.seatsLeft", { n: 3 }), "3 seats left");
  assert.equal(id("card.seatsLeft", { n: 3 }), "Sisa 3 kursi");
  assert.equal(id("book.withGm", { name: "Raka" }), "bersama Raka");
});

test("English is the default language and listed first", () => {
  assert.equal(DEFAULT_LANG, "en");
  assert.equal(LANGS[0], "en");
});
