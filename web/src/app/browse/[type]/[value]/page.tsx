import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/dict";
import { countGames, searchGames, searchGms, systemFromSlug, type GameFilters } from "@/lib/queries";
import {
  GENRES, STYLES, genreDescKey, genreIcon, genreLabelKey, isGenre, isStyle,
  styleDescKey, styleIcon, styleLabelKey, systemDescKey, systemSlug,
} from "@/lib/categories";
import type { RegularIcon } from "@/lib/icons";
import { EmptyState, GameCard } from "@/components/ui";
import { GmCard } from "@/components/gm-card";
import { Icon } from "@/components/icon";

type Resolved = { title: string; desc: string; icon: RegularIcon; filter: GameFilters; gmFilter: { system?: string; genre?: string; style?: string }; gamesHref: string };

/** Turn /browse/<type>/<value> into a heading, blurb and filters (or null → 404). */
function resolve(type: string, value: string, t: T): Resolved | null {
  if (type === "genre" && isGenre(value)) {
    return { title: t(genreLabelKey(value)), desc: t(genreDescKey(value)), icon: genreIcon(value), filter: { genre: value }, gmFilter: { genre: value }, gamesHref: `/games?genre=${value}` };
  }
  if (type === "style" && isStyle(value)) {
    return { title: t(styleLabelKey(value)), desc: t(styleDescKey(value)), icon: styleIcon(value), filter: { style: value }, gmFilter: { style: value }, gamesHref: `/games?style=${value}` };
  }
  if (type === "system") {
    const system = systemFromSlug(value);
    if (!system) return null;
    const desc = systemDescKey(systemSlug(system));
    return {
      title: system, desc: desc ? t(desc) : t("browse.systemGeneric"), icon: "dice-d20",
      filter: { system }, gmFilter: { system }, gamesHref: `/games?system=${encodeURIComponent(system)}`,
    };
  }
  return null;
}

export async function generateMetadata(props: PageProps<"/browse/[type]/[value]">): Promise<Metadata> {
  const { type, value } = await props.params;
  const { t } = await getI18n();
  const r = resolve(type, value, t);
  return r ? { title: r.title, description: r.desc } : {};
}

export default async function CategoryPage(props: PageProps<"/browse/[type]/[value]">) {
  const { type, value } = await props.params;
  const { t } = await getI18n();
  const r = resolve(type, value, t);
  if (!r) notFound();
  const games = searchGames({ ...r.filter, sort: "soonest" }, 24);
  const total = countGames(r.filter);
  const gms = searchGms(r.gmFilter, 3);
  const typeLabel = t(type === "genre" ? "browse.genre" : type === "style" ? "browse.style" : "browse.system");
  const siblings =
    type === "genre" ? GENRES.filter((g) => g.key !== value).map((g) => ({ href: `/browse/genre/${g.key}`, label: t(genreLabelKey(g.key)), icon: genreIcon(g.key) }))
    : type === "style" ? STYLES.filter((s) => s.key !== value).map((s) => ({ href: `/browse/style/${s.key}`, label: t(styleLabelKey(s.key)), icon: styleIcon(s.key) }))
    : [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="flex items-center gap-1.5 text-sm text-muted" aria-label={t("common.breadcrumb")}>
        <Link href="/browse" className="hover:text-text">{t("browse.hubTitle")}</Link>
        <Icon name="arrow-right" className="text-xs" />
        <Link href={`/browse#${type === "system" ? "systems" : type === "genre" ? "genres" : "styles"}`} className="hover:text-text">{typeLabel}</Link>
      </nav>
      <header className="mt-3 flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-2xl text-accent"><Icon name={r.icon} /></span>
        <div className="min-w-60 flex-1">
          <p className="eyebrow">{typeLabel}</p>
          <h1 className="text-3xl font-bold sm:text-4xl">{r.title}</h1>
          <p className="mt-1 max-w-2xl text-muted">{r.desc}</p>
        </div>
        <Link href={r.gamesHref} className="btn-secondary"><Icon name="filter" /> {t("browse.moreFilters")}</Link>
      </header>

      <section className="mt-8">
        <h2 className="mb-4 text-xl font-bold">{t("browse.gamesIn", { n: total })}</h2>
        {games.length === 0 ? (
          <EmptyState title={t("browse.emptyCategory")}>
            <Link href="/hire-a-gm/request" className="btn-primary mt-3"><Icon name="briefcase" /> {t("hire.ctaRequest")}</Link>
          </EmptyState>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{games.map((g) => <GameCard key={g.id} game={g} t={t} />)}</div>
            {total > games.length && (
              <p className="mt-6 text-center">
                <Link href={r.gamesHref} className="btn-secondary">{t("browse.seeAll", { n: total })} <Icon name="arrow-right" /></Link>
              </p>
            )}
          </>
        )}
      </section>

      {gms.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("browse.gmsFor", { name: r.title })}</h2>
            <Link href={`/hire-a-gm?${new URLSearchParams(r.gmFilter as Record<string, string>)}#directory`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
              {t("hire.directoryTitle")} <Icon name="arrow-right" />
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{gms.map((g) => <GmCard key={g.id} gm={g} t={t} />)}</div>
        </section>
      )}

      {siblings.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-lg font-semibold">{t("browse.moreOf", { type: typeLabel.toLowerCase() })}</h2>
          <div className="flex flex-wrap gap-2">
            {siblings.map((s) => <Link key={s.href} href={s.href} className="chip gap-1 hover:border-accent hover:text-accent"><Icon name={s.icon} /> {s.label}</Link>)}
          </div>
        </section>
      )}
    </div>
  );
}
