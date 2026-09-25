import Image from "next/image";
import Link from "next/link";
import { searchGames, listSystemsInUse } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { GameCard, Notice } from "@/components/ui";
import { Icon } from "@/components/icon";
import { GENRES, genreIcon, genreLabelKey } from "@/lib/categories";

export default async function HomePage(props: PageProps<"/">) {
  const { t } = await getI18n();
  const { deleted } = await props.searchParams;
  const soonest = searchGames({ sort: "soonest" }, 6);
  const beginner = searchGames({ level: "beginner", sort: "rating" }, 3);
  const systems = listSystemsInUse();

  return (
    <>
      {deleted && <div className="mx-auto max-w-6xl px-4 pt-6"><Notice tone="success">{t("delete.done")}</Notice></div>}
      {/* Tavern hero: candlelit scene (public/images/tavern/hero.svg, npm run tavern-art) under a dark wash for legible text. */}
      <section className="on-wood relative overflow-hidden border-b-2 border-[#8a6a3a] bg-[#1b1008]">
        <Image src="/images/tavern/hero.svg" alt="" fill priority sizes="100vw" className="object-cover object-[70%_center]" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-[#140b05]/95 from-15% via-[#140b05]/65 via-50% to-[#140b05]/0 to-85%" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#140b05]/80 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="eyebrow text-accent!">{t("home.eyebrow")}</p>
          <span aria-hidden className="ornament mt-3 w-40!" />
          <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight drop-shadow-[0_2px_8px_rgb(0_0_0/0.6)] sm:text-6xl">
            {t("home.title1")} <br className="hidden sm:block" />{t("home.title2")}
          </h1>
          <p className="mt-5 max-w-xl text-lg text-text/90">{t("home.lead")}</p>
          <form action="/games" className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row" role="search">
            <label htmlFor="hero-q" className="sr-only">{t("home.searchLabel")}</label>
            <div className="relative flex-1">
              <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="hero-q" name="q" className="input py-3! pl-10! text-base!" placeholder={t("home.searchPlaceholder")} />
            </div>
            <button className="btn-primary px-6! py-3! text-base!" type="submit">{t("common.search")}</button>
          </form>
          <div className="mt-6 flex flex-wrap gap-2">
            {systems.slice(0, 7).map((s) => (
              <Link key={s.system} href={`/games?system=${encodeURIComponent(s.system)}`} className="chip gap-1 bg-black/30! hover:border-accent hover:text-accent">
                <Icon name="dice-d20" /> {s.system}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="hourglass-end" className="text-accent" /> {t("home.soon")}</h2>
          <Link href="/games" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">{t("home.browseAll")} <Icon name="arrow-right" /></Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {soonest.map((g) => <GameCard key={g.id} game={g} t={t} />)}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="grid gap-8 rounded-2xl border border-border bg-surface p-8 md:grid-cols-3">
          {([
            ["1", "search", "home.step1Title", "home.step1Body"],
            ["2", "ticket", "home.step2Title", "home.step2Body"],
            ["3", "dragon", "home.step3Title", "home.step3Body"],
          ] as const).map(([n, icon, title, body]) => (
            <div key={n}>
              <span className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent">
                <Icon name={icon} />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">{n}</span>
              </span>
              <h3 className="mt-3 text-lg font-semibold">{t(title)}</h3>
              <p className="mt-1 text-sm text-muted">{t(body)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="map" className="text-accent" /> {t("home.browseCategories")}</h2>
          <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline">{t("browse.hubTitle")} <Icon name="arrow-right" /></Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {GENRES.map((g) => (
            <Link key={g.key} href={`/browse/genre/${g.key}`} className="card flex items-center gap-3 p-3 hover:border-accent">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-lg text-accent"><Icon name={genreIcon(g.key)} /></span>
              <span className="text-sm font-semibold">{t(genreLabelKey(g.key))}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <Link href="/hire-a-gm" className="card flex flex-col items-start gap-4 p-6 hover:border-accent sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl text-accent"><Icon name="briefcase" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>{t("home.hireTitle")}</span>
            <span className="mt-1 block text-sm text-muted">{t("home.hireBody")}</span>
          </span>
          <span className="btn-primary shrink-0">{t("nav.hireGm")} <Icon name="arrow-right" /></span>
        </Link>
      </section>

      {beginner.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="seedling" className="text-success" /> {t("home.newTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("home.newBody")}</p>
            </div>
            <Link href="/games?level=beginner" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent hover:underline">{t("home.moreBeginner")} <Icon name="arrow-right" /></Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {beginner.map((g) => <GameCard key={g.id} game={g} t={t} />)}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-accent p-8 text-accent-ink sm:flex-row sm:items-center">
          <div className="flex items-start gap-4">
            <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-ink/15 text-3xl sm:flex"><Icon name="hat-wizard" /></span>
            <div>
            <h2 className="text-2xl font-bold">{t("home.gmCtaTitle")}</h2>
            <p className="mt-1 opacity-90">{t("home.gmCtaBody")}</p>
            </div>
          </div>
          <Link href="/become-a-gm" className="btn shrink-0 bg-accent-ink text-accent hover:opacity-90"><Icon name="arrow-right" /> {t("nav.becomeGm")}</Link>
        </div>
      </section>
    </>
  );
}
