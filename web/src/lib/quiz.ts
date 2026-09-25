// Pure: "What kind of adventurer are you?" — four quick questions turned into game filters.
import type { MsgKey } from "./i18n/dict";
import type { RegularIcon } from "./icons";

export const QUIZ = {
  mood: ["spooky", "heroic", "scifi", "cozy", "intrigue", "any"],
  where: ["online", "in_person", "any"],
  budget: ["free", "low", "mid", "any"],
  experience: ["new", "some", "veteran"],
} as const;

export type QuizAnswers = {
  mood: (typeof QUIZ.mood)[number];
  where: (typeof QUIZ.where)[number];
  budget: (typeof QUIZ.budget)[number];
  experience: (typeof QUIZ.experience)[number];
};

export const MOOD_GENRE: Record<Exclude<QuizAnswers["mood"], "any">, string> = {
  spooky: "horror",
  heroic: "fantasy",
  scifi: "sci-fi",
  cozy: "cozy",
  intrigue: "dark-fantasy",
};

export const MOOD_ICON: Record<QuizAnswers["mood"], RegularIcon> = {
  spooky: "ghost", heroic: "dragon", scifi: "rocket", cozy: "campfire", intrigue: "theater-masks", any: "dice-d20",
};

export const BUDGET_MAX: Record<"low" | "mid", number> = { low: 50_000, mid: 100_000 };

const pick = <T extends readonly string[]>(options: T, v: unknown): T[number] | undefined =>
  (options as readonly unknown[]).includes(v) ? (v as T[number]) : undefined;

/** All four answers from the query string, or null if the quiz isn't finished. */
export function parseQuiz(raw: Record<string, unknown>): QuizAnswers | null {
  const mood = pick(QUIZ.mood, raw.mood);
  const where = pick(QUIZ.where, raw.where);
  const budget = pick(QUIZ.budget, raw.budget);
  const experience = pick(QUIZ.experience, raw.experience);
  return mood && where && budget && experience ? { mood, where, budget, experience } : null;
}

/** Filter shape shared with searchGames (kept local so this module stays pure). */
export type QuizFilters = { genre?: string; location?: string; level?: string; free?: boolean; maxPrice?: number; sort: "soonest" };

export type QuizStep = { filters: QuizFilters; relaxed: MsgKey[] };

/**
 * From the strictest match to the loosest: drop budget, then place, then level, then
 * mood, until something matches. The page shows which wishes were relaxed.
 */
export function quizLadder(a: QuizAnswers): QuizStep[] {
  const base: QuizFilters = { sort: "soonest" };
  if (a.mood !== "any") base.genre = MOOD_GENRE[a.mood];
  if (a.where !== "any") base.location = a.where;
  if (a.experience === "new") base.level = "beginner";
  if (a.experience === "veteran") base.level = "experienced";
  if (a.budget === "free") base.free = true;
  if (a.budget === "low" || a.budget === "mid") base.maxPrice = BUDGET_MAX[a.budget];

  const steps: QuizStep[] = [{ filters: base, relaxed: [] }];
  const relaxed: MsgKey[] = [];
  let f = { ...base };
  const drop = (keys: (keyof QuizFilters)[], label: MsgKey) => {
    if (!keys.some((k) => f[k] !== undefined)) return;
    f = { ...f };
    for (const k of keys) delete f[k];
    relaxed.push(label);
    steps.push({ filters: f, relaxed: [...relaxed] });
  };
  drop(["free", "maxPrice"], "quiz.relaxBudget");
  drop(["location"], "quiz.relaxWhere");
  drop(["level"], "quiz.relaxLevel");
  drop(["genre"], "quiz.relaxMood");
  return steps;
}
