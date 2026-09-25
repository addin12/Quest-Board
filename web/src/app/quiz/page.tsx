import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/dict";
import { searchGames, searchGms } from "@/lib/queries";
import { MOOD_GENRE, MOOD_ICON, QUIZ, parseQuiz, quizLadder, type QuizAnswers } from "@/lib/quiz";
import { GameCard, Notice } from "@/components/ui";
import { GmCard } from "@/components/gm-card";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("quiz.title"), description: t("quiz.lead") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** "What kind of adventurer are you?" — four questions, then matching tables (a GET form, no JS needed). */
export default async function QuizPage(props: PageProps<"/quiz">) {
  const { t } = await getI18n();
  const sp = await props.searchParams;
  const raw = Object.fromEntries(Object.keys(QUIZ).map((k) => [k, one(sp[k])]));
  const answers = parseQuiz(raw);
  const submitted = Object.values(raw).some(Boolean);

  return (
    <div>
      <section className="on-wood wood-plank border-b-2 border-[#8a6a3a]">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <p className="eyebrow text-accent!">{t("quiz.eyebrow")}</p>
          <span aria-hidden className="ornament mx-auto mt-3 w-40!" />
          <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">{t("quiz.title")}</h1>
          <p className="mx-auto mt-2 max-w-xl text-text/90">{t("quiz.lead")}</p>
        </div>
      </section>
      <div className="mx-auto max-w-4xl px-4 py-10">
        {answers ? <Results a={answers} t={t} /> : <QuizForm t={t} raw={raw} missing={submitted} />}
      </div>
    </div>
  );
}

type Q = { key: keyof QuizAnswers; options: readonly string[]; icon?: (v: string) => RegularIcon };

function QuizForm({ t, raw, missing }: { t: Awaited<ReturnType<typeof getI18n>>["t"]; raw: Record<string, string>; missing: boolean }) {
  const questions: Q[] = [
    { key: "mood", options: QUIZ.mood, icon: (v) => MOOD_ICON[v as QuizAnswers["mood"]] },
    { key: "where", options: QUIZ.where },
    { key: "budget", options: QUIZ.budget },
    { key: "experience", options: QUIZ.experience },
  ];
  return (
    <form action="/quiz" className="space-y-6">
      {missing && <Notice tone="danger">{t("quiz.answerAll")}</Notice>}
      {questions.map((q, i) => (
        <fieldset key={q.key} className="card p-5">
          <legend className="sr-only">{t(`quiz.q.${q.key}` as MsgKey)}</legend>
          <p aria-hidden className="mb-3 flex items-center gap-2 text-lg font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm text-accent-ink">{i + 1}</span>
            {t(`quiz.q.${q.key}` as MsgKey)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {q.options.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface-2/50 p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent">
                <input type="radio" name={q.key} value={o} required defaultChecked={raw[q.key] === o} className="accent-[var(--accent)]" />
                {q.icon && <Icon name={q.icon(o)} className="text-lg" />}
                <span className="font-semibold">{t(`quiz.a.${q.key}.${o}` as MsgKey)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button className="btn-primary w-full px-6! py-3! text-base! sm:w-auto"><Icon name="sparkles" /> {t("quiz.submit")}</button>
    </form>
  );
}

function Results({ a, t }: { a: QuizAnswers; t: Awaited<ReturnType<typeof getI18n>>["t"] }) {
  const ladder = quizLadder(a);
  let step = ladder[0];
  let games = searchGames(step.filters, 6);
  for (const s of ladder.slice(1)) {
    if (games.length > 0) break;
    step = s;
    games = searchGames(s.filters, 6);
  }
  const gms = searchGms({ genre: a.mood !== "any" ? MOOD_GENRE[a.mood] : undefined, where: a.where === "online" ? "online" : undefined }, 3);
  return (
    <div>
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent"><Icon name={MOOD_ICON[a.mood]} /></span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{t("quiz.youAre")}</p>
          <h2 className="text-2xl font-bold">{t(`quiz.persona.${a.mood}` as MsgKey)}</h2>
          <p className="text-sm text-muted">{t(`quiz.personaBody.${a.mood}` as MsgKey)}</p>
        </div>
        <Link href="/quiz" className="btn-secondary"><Icon name="arrow-left" /> {t("quiz.retake")}</Link>
      </div>

      {step.relaxed.length > 0 && games.length > 0 && (
        <div className="mt-5"><Notice>{t("quiz.relaxedNote", { list: step.relaxed.map((k) => t(k)).join(", ") })}</Notice></div>
      )}

      <h2 className="mt-8 mb-4 text-xl font-bold">{t("quiz.matches", { n: games.length })}</h2>
      {games.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{games.map((g) => <GameCard key={g.id} game={g} t={t} />)}</div>
      ) : (
        <p className="text-muted">{t("quiz.noMatches")}</p>
      )}

      {gms.length > 0 && (
        <>
          <h2 className="mt-10 mb-4 text-xl font-bold">{t("quiz.gms")}</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{gms.map((g) => <GmCard key={g.id} gm={g} t={t} />)}</div>
        </>
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link href="/board" className="card flex items-center gap-3 p-5 hover:border-accent">
          <Icon name="thumbtack" className="text-2xl text-accent" />
          <span><span className="block font-semibold">{t("quiz.ctaBoard")}</span><span className="block text-sm text-muted">{t("home.boardBody")}</span></span>
        </Link>
        <Link href="/hire-a-gm/request" className="card flex items-center gap-3 p-5 hover:border-accent">
          <Icon name="briefcase" className="text-2xl text-accent" />
          <span><span className="block font-semibold">{t("quiz.ctaHire")}</span><span className="block text-sm text-muted">{t("home.hireBody")}</span></span>
        </Link>
      </div>
    </div>
  );
}
