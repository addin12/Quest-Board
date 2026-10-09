// The browser gets only the strings client code uses (lib/i18n/client-keys.ts, generated). If this fails,
// client code names a string the list doesn't have yet: run `npm run i18n:client-keys` and commit the file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLIENT_KEYS } from "../../src/lib/i18n/client-keys.ts";
import { clientMessages, DICTIONARIES } from "../../src/lib/i18n/dict.ts";
import { computeClientKeys } from "../../scripts/build-client-keys.mjs";

test("the client string list is up to date with the code", () => {
  assert.deepEqual([...CLIENT_KEYS], computeClientKeys(), "run `npm run i18n:client-keys`");
});

test("every listed key exists, and each language sends only those, all filled in", () => {
  for (const k of CLIENT_KEYS) assert.ok(k in DICTIONARIES.en, k);
  for (const lang of ["en", "id"] as const) {
    const m = clientMessages(lang);
    assert.equal(Object.keys(m).length, CLIENT_KEYS.length);
    for (const v of Object.values(m)) assert.ok(typeof v === "string" && v.length > 0);
  }
  assert.ok(CLIENT_KEYS.length < Object.keys(DICTIONARIES.en).length / 2); // the point: well under half
});
