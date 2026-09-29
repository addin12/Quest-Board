// Search box → terms: any word order, both languages' category and level words, shorthand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch, MAX_TERMS } from "../../src/lib/search-terms.ts";

test("words become separate terms; category and level words also match tags", () => {
  const [horor, pemula] = parseSearch("Horor PEMULA");
  assert.equal(horor.text, "horor");
  assert.ok(horor.genres.includes("horror"));
  assert.ok(horor.genres.includes("gothic-horror") && horor.genres.includes("eldritch-horror")); // sub-genres too
  assert.equal(pemula.text, "pemula");
  assert.equal(pemula.level, "beginner");
  assert.deepEqual(parseSearch("veteran")[0].level, "experienced");
  assert.ok(parseSearch("misteri")[0].genres.includes("mystery"));
  assert.ok(parseSearch("misteri")[0].styles.includes("puzzle-mystery"));
  assert.ok(parseSearch("fantasi")[0].genres.includes("fantasy"));
  assert.ok(parseSearch("tactical")[0].styles.includes("tactical"));
  assert.ok(parseSearch("taktis")[0].styles.includes("tactical"));
});

test("stop words, repeats and noise are dropped; shorthand expands; a cap on terms", () => {
  assert.deepEqual(parseSearch("game horor untuk pemula").map((t) => t.text), ["horor", "pemula"]);
  assert.deepEqual(parseSearch("horor horor").length, 1);
  assert.equal(parseSearch("dnd")[0].text, "d&d");
  assert.equal(parseSearch("D&D 5e")[0].text, "d&d");
  assert.equal(parseSearch("D&D 5e")[1].text, "5e");
  assert.deepEqual(parseSearch("light")[0].styles, []); // "Roleplay-light" alone shouldn't pull in a style
  assert.deepEqual(parseSearch("  %_  "), []);
  assert.equal(parseSearch("a b c d e f g h i j k l m n o p q r s t").length, 0); // single letters dropped
  assert.equal(parseSearch("one two three four five six seven eight").length, MAX_TERMS);
});
