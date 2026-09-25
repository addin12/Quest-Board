import { test } from "node:test";
import assert from "node:assert/strict";
import { MOOD_GENRE, QUIZ, parseQuiz, quizLadder } from "../../src/lib/quiz.ts";
import { DICTIONARIES } from "../../src/lib/i18n/dict.ts";
import { GENRES } from "../../src/lib/categories.ts";

test("parseQuiz needs all four valid answers", () => {
  assert.deepEqual(parseQuiz({ mood: "spooky", where: "online", budget: "free", experience: "new" }), { mood: "spooky", where: "online", budget: "free", experience: "new" });
  assert.equal(parseQuiz({ mood: "spooky", where: "online", budget: "free" }), null);
  assert.equal(parseQuiz({ mood: "zombies", where: "online", budget: "free", experience: "new" }), null);
});

test("quizLadder goes from strict to loose, relaxing budget → place → level → mood", () => {
  const steps = quizLadder({ mood: "spooky", where: "in_person", budget: "low", experience: "new" });
  assert.deepEqual(steps[0].filters, { sort: "soonest", genre: "horror", location: "in_person", level: "beginner", maxPrice: 50000 });
  assert.deepEqual(steps.map((s) => s.relaxed.length), [0, 1, 2, 3, 4]);
  assert.deepEqual(steps.at(-1)!.filters, { sort: "soonest" });
  assert.deepEqual(steps.at(-1)!.relaxed, ["quiz.relaxBudget", "quiz.relaxWhere", "quiz.relaxLevel", "quiz.relaxMood"]);
  // Nothing to relax when everything is "any".
  assert.equal(quizLadder({ mood: "any", where: "any", budget: "any", experience: "some" }).length, 1);
  // Free means free, not a price cap.
  assert.equal(quizLadder({ mood: "any", where: "any", budget: "free", experience: "some" })[0].filters.free, true);
});

test("every quiz mood maps to a real genre and every option is translated", () => {
  const genreKeys = GENRES.map((g) => g.key as string);
  for (const g of Object.values(MOOD_GENRE)) assert.ok(genreKeys.includes(g), g);
  for (const lang of ["en", "id"] as const) {
    for (const [q, opts] of Object.entries(QUIZ)) {
      assert.ok(DICTIONARIES[lang][`quiz.q.${q}` as keyof typeof DICTIONARIES.en], `${lang} quiz.q.${q}`);
      for (const o of opts) assert.ok(DICTIONARIES[lang][`quiz.a.${q}.${o}` as keyof typeof DICTIONARIES.en], `${lang} quiz.a.${q}.${o}`);
    }
    for (const m of QUIZ.mood) assert.ok(DICTIONARIES[lang][`quiz.persona.${m}` as keyof typeof DICTIONARIES.en]);
  }
});
