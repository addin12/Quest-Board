import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { categorySummary, idleKnownSystems } from "@/lib/queries";
import { GENRES, MECHANICS, STYLES, genreDescKey, genreIcon, genreLabelKey, mechanicDescKey, styleDescKey, styleIcon, styleLabelKey, systemDescKey, systemSlug } from "@/lib/categories";
import type { RegularIcon } from "@/lib/icons";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("browse.hubTitle"), description: t("browse.hubLead") };
}

/** Browse hub: game systems, genres and play styles. */
export default async function BrowseHubPage() {
  const { t } = await getI18n();
  const { systems, genres, styles, mechanics } = categorySummary();
  const idle = idleKnownSystems();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="map" className="text-accent" /> {t("browse.hubTitle")}</h1>
      <p className="mt-1 max-w-2xl text-muted">{t("browse.hubLead")}</p>
      <nav className="mt-5 flex flex-wrap gap-2" aria-label={t("browse.hubTitle")}>
        <a href="#systems" className="chip gap-1 hover:text-accent"><Icon name="dice-d20" /> {t("browse.systems")}</a>
        <a href="#genres" className="chip gap-1 hover:text-accent"><Icon name="dragon" /> {t("browse.genres")}</a>
        <a href="#styles" className="chip gap-1 hover:text-accent"><Icon name="theater-masks" /> {t("browse.styles")}</a>
        <a href="#mechanics" className="chip gap-1 hover:text-accent"><Icon name="dice" /> {t("browse.mechanics")}</a>
      </nav>

      <section id="systems" className="mt-10 scroll-mt-24">
        <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="dice-d20" className="text-accent" /> {t("browse.systems")}</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {systems.map((s) => {
            const desc = systemDescKey(s.slug);
            return (
              <Link key={s.slug} href={`/browse/system/${s.slug}`} className="card group overflow-hidden hover:border-accent">
                <span
                  className="relative block h-28"
                  style={{ background: `linear-gradient(135deg, hsl(${s.hue} 60% 45%), hsl(${(s.hue + 40) % 360} 50% 20%))` }}
                >
                  {s.cover && <Image src={s.cover} alt="" fill sizes="(min-width: 1024px) 33vw, 50vw" className="object-cover transition-transform group-hover:scale-105" />}
                  <span className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
                  <span className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2 text-white">
                    <span className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{s.system}</span>
                    <span className="rounded-md bg-black/45 px-2 py-0.5 text-xs font-semibold">{t("browse.gameCount", { n: s.n })}</span>
                  </span>
                </span>
                {desc && <span className="block p-3 text-sm text-muted">{t(desc)}</span>}
              </Link>
            );
          })}
        </div>
        {idle.length > 0 && (
          <details className="group mt-5">
            <summary className="cursor-pointer text-sm font-semibold text-accent hover:underline">{t("browse.moreSystemsAll", { n: idle.length })}</summary>
            <p className="mt-2 text-sm text-muted">{t("browse.moreSystems")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {idle.map((s) => (
                <Link key={s} href={`/browse/system/${systemSlug(s)}`} className="chip gap-1 hover:border-accent hover:text-accent"><Icon name="dice-d20" /> {s}</Link>
              ))}
            </div>
          </details>
        )}
      </section>

      <CategoryGrid
        id="genres"
        icon="dragon"
        title={t("browse.genres")}
        items={GENRES.map((g) => ({ href: `/browse/genre/${g.key}`, icon: genreIcon(g.key), label: t(genreLabelKey(g.key)), desc: t(genreDescKey(g.key)), n: genres[g.key] ?? 0 }))}
        countLabel={(n) => t("browse.gameCount", { n })}
        emptyLabel={t("browse.noGamesYet")}
      />
      <CategoryGrid
        id="styles"
        icon="theater-masks"
        title={t("browse.styles")}
        items={STYLES.map((s) => ({ href: `/browse/style/${s.key}`, icon: styleIcon(s.key), label: t(styleLabelKey(s.key)), desc: t(styleDescKey(s.key)), n: styles[s.key] ?? 0 }))}
        countLabel={(n) => t("browse.gameCount", { n })}
        emptyLabel={t("browse.noGamesYet")}
      />
      <CategoryGrid
        id="mechanics"
        icon="dice"
        title={t("browse.mechanics")}
        items={MECHANICS.map((m) => ({ href: `/browse/mechanic/${m.key}`, icon: m.icon as RegularIcon, label: m.name, desc: t(mechanicDescKey(m.key)), n: mechanics[m.key] ?? 0 }))}
        countLabel={(n) => t("browse.gameCount", { n })}
        emptyLabel={t("browse.noGamesYet")}
      />
    </div>
  );
}

/** Categories with games get a card; the rest are compact chips below (the page stays scannable). */
function CategoryGrid({ id, icon, title, items, countLabel, emptyLabel }: {
  id: string; icon: RegularIcon; title: string; countLabel: (n: number) => string; emptyLabel: string;
  items: { href: string; icon: RegularIcon; label: string; desc: string; n: number }[];
}) {
  const withGames = items.filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const empty = items.filter((c) => c.n === 0);
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name={icon} className="text-accent" /> {title}</h2>
      {empty.length > 0 && withGames.length === 0 && <p className="mt-2 text-sm text-muted">{emptyLabel}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {withGames.map((c) => (
          <Link key={c.href} href={c.href} className="card flex gap-3 p-4 hover:border-accent">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent"><Icon name={c.icon} /></span>
            <span className="min-w-0">
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{c.label}</span>
                <span className="shrink-0 text-xs text-muted">{countLabel(c.n)}</span>
              </span>
              <span className="mt-0.5 block text-sm text-muted">{c.desc}</span>
            </span>
          </Link>
        ))}
      </div>
      {empty.length > 0 && (
        <div className="mt-4">
          {withGames.length > 0 && <p className="text-sm text-muted">{emptyLabel}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {empty.map((c) => (
              <Link key={c.href} href={c.href} title={c.desc} className="chip gap-1 hover:border-accent hover:text-accent"><Icon name={c.icon} /> {c.label}</Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
