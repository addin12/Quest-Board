import type { Metadata } from "next";
import Link from "next/link";
import { countGames, listCitiesInUse, searchGames, listSystemsInUse, type GameFilters } from "@/lib/queries";
import { getI18n } from "@/lib/i18n/server";
import { parseIdr } from "@/lib/policy";
import { EmptyState, GameCard } from "@/components/ui";
import { Icon } from "@/components/icon";
import { FilterSheet } from "@/components/filter-sheet";
import { GENRES, STYLES, genreLabelKey, isGenre, isStyle, styleLabelKey } from "@/lib/categories";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("browse.title") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Games per "page"; "Load more" shows the next batch below the ones already on screen. */
const PAGE_SIZE = 24;
const MAX_PAGE = 20;

export default async function BrowsePage(props: PageProps<"/games">) {
  const { t } = await getI18n();
  const sp = await props.searchParams;
  const maxPriceRaw = one(sp.maxPrice);
  const filters: GameFilters = {
    q: one(sp.q).slice(0, 80) || undefined,
    system: one(sp.system) || undefined,
    format: one(sp.format) || undefined,
    location: one(sp.location) || undefined,
    language: one(sp.language) || undefined,
    level: one(sp.level) || undefined,
    city: one(sp.city).slice(0, 60) || undefined,
    genre: isGenre(one(sp.genre)) ? one(sp.genre) : undefined,
    style: isStyle(one(sp.style)) ? one(sp.style) : undefined,
    maxPrice: maxPriceRaw ? (parseIdr(maxPriceRaw) ?? undefined) : undefined,
    free: one(sp.free) === "1",
    sort: (["soonest", "price_asc", "price_desc", "rating", "newest"] as const).find((s) => s === one(sp.sort)) ?? "soonest",
  };
  const page = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(one(sp.page))) || 1));
  const total = countGames(filters);
  const games = searchGames(filters, page * PAGE_SIZE);
  const systems = listSystemsInUse();
  const cities = listCitiesInUse();
  const active = Object.entries(sp).filter(([k, v]) => k !== "sort" && k !== "page" && one(v)).length;
  const hasMore = games.length < total && page < MAX_PAGE;
  const more = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== "page" && one(v)) more.set(k, one(v));
  more.set("page", String(page + 1));
  const firstNew = (page - 1) * PAGE_SIZE; // the card "Load more" scrolls to

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold">{t("browse.title")}</h1>
        <Link href="/browse" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"><Icon name="map" /> {t("browse.byCategory")}</Link>
      </div>
      <p className="mt-1 text-muted">{t("browse.count", { n: total })}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_1fr]">
        <div className="h-fit lg:sticky lg:top-24">
        <FilterSheet active={active}>
        <form className="card space-y-5 p-5 max-lg:rounded-none max-lg:border-0 max-lg:shadow-none" aria-label={t("browse.filters")}>
          <p className="eyebrow flex items-center gap-1.5 max-lg:hidden"><Icon name="filter" /> {t("browse.filters")}</p>
          <div>
            <label htmlFor="q" className="label">{t("common.search")}</label>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input id="q" name="q" defaultValue={filters.q} className="input pl-9!" placeholder={t("browse.searchPlaceholder")} />
            </div>
          </div>
          <div>
            <label htmlFor="system" className="label flex items-center gap-1.5"><Icon name="dice-d20" className="text-muted" /> {t("browse.system")}</label>
            <select id="system" name="system" defaultValue={filters.system ?? ""} className="input">
              <option value="">{t("browse.anySystem")}</option>
              {systems.map((s) => (
                <option key={s.system} value={s.system}>{s.system} ({s.n})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div>
              <label htmlFor="genre" className="label flex items-center gap-1.5"><Icon name="dragon" className="text-muted" /> {t("browse.genre")}</label>
              <select id="genre" name="genre" defaultValue={filters.genre ?? ""} className="input">
                <option value="">{t("common.any")}</option>
                {GENRES.map((g) => <option key={g.key} value={g.key}>{t(genreLabelKey(g.key))}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="style" className="label flex items-center gap-1.5"><Icon name="theater-masks" className="text-muted" /> {t("browse.style")}</label>
              <select id="style" name="style" defaultValue={filters.style ?? ""} className="input">
                <option value="">{t("common.any")}</option>
                {STYLES.map((s) => <option key={s.key} value={s.key}>{t(styleLabelKey(s.key))}</option>)}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className="label flex items-center gap-1.5"><Icon name="language" className="text-muted" /> {t("browse.language")}</legend>
            <Radios name="language" value={filters.language} options={[["", t("common.any")], ["id", "Bahasa Indonesia"], ["en", "English"]]} />
          </fieldset>
          <fieldset>
            <legend className="label flex items-center gap-1.5"><Icon name="book-open-cover" className="text-muted" /> {t("browse.format")}</legend>
            <Radios name="format" value={filters.format} options={[["", t("common.any")], ["one_shot", t("format.one_shot")], ["campaign", t("format.campaign")]]} />
          </fieldset>
          <fieldset>
            <legend className="label flex items-center gap-1.5"><Icon name="marker" className="text-muted" /> {t("browse.where")}</legend>
            <Radios name="location" value={filters.location} options={[["", t("browse.anywhere")], ["online", t("loc.online")], ["in_person", t("loc.inPerson")]]} />
          </fieldset>
          {(cities.length > 0 || filters.city) && (
            <div>
              <label htmlFor="city" className="label flex items-center gap-1.5"><Icon name="city" className="text-muted" /> {t("browse.city")}</label>
              <select id="city" name="city" defaultValue={filters.city ?? ""} className="input">
                <option value="">{t("browse.anyCity")}</option>
                {filters.city && !cities.some((c) => c.city.toLowerCase() === filters.city!.toLowerCase()) && <option value={filters.city}>{`${filters.city} (0)`}</option>}
                {cities.map((c) => <option key={c.city} value={c.city}>{c.city} ({c.n})</option>)}
              </select>
            </div>
          )}
          <fieldset>
            <legend className="label flex items-center gap-1.5"><Icon name="graduation-cap" className="text-muted" /> {t("browse.experience")}</legend>
            <Radios name="level" value={filters.level} options={[["", t("common.any")], ["beginner", t("browse.imNew")], ["experienced", t("browse.experienced")]]} />
          </fieldset>
          <div>
            <label htmlFor="maxPrice" className="label flex items-center gap-1.5"><Icon name="coins" className="text-muted" /> {t("browse.maxPrice")}</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">Rp</span>
              <input id="maxPrice" name="maxPrice" inputMode="numeric" defaultValue={maxPriceRaw} className="input pl-9!" placeholder="100.000" />
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="free" value="1" defaultChecked={filters.free} className="accent-[var(--accent)]" /> {t("browse.freeOnly")}
            </label>
          </div>
          <div>
            <label htmlFor="sort" className="label flex items-center gap-1.5"><Icon name="sort-alt" className="text-muted" /> {t("browse.sort")}</label>
            <select id="sort" name="sort" defaultValue={filters.sort} className="input">
              <option value="soonest">{t("sort.soonest")}</option>
              <option value="rating">{t("sort.rating")}</option>
              <option value="price_asc">{t("sort.priceAsc")}</option>
              <option value="price_desc">{t("sort.priceDesc")}</option>
              <option value="newest">{t("sort.newest")}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1"><Icon name="check" /> {t("browse.apply")}</button>
            {active > 0 && <Link href="/games" className="btn-secondary">{t("browse.clear")}</Link>}
          </div>
        </form>
        </FilterSheet>
        </div>

        <section aria-label={t("browse.results")}>
          {games.length === 0 ? (
            <EmptyState title={t("browse.emptyTitle")}>
              {t("browse.emptyBody")} <Link href="/games" className="text-accent underline">{t("browse.clearAll")}</Link>
            </EmptyState>
          ) : (
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {games.map((g, i) => (
                  <div key={g.id} id={i === firstNew && page > 1 ? "more" : undefined} className="scroll-mt-28">
                    <GameCard game={g} t={t} />
                  </div>
                ))}
              </div>
              <div className="mt-8 flex flex-col items-center gap-3">
                <p className="text-sm text-muted">{t("browse.showing", { shown: games.length, n: total })}</p>
                {hasMore && (
                  <Link href={`/games?${more.toString()}#more`} scroll={false} className="btn-secondary"><Icon name="plus" /> {t("browse.loadMore")}</Link>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Radios({ name, value, options }: { name: string; value?: string; options: [string, string][] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" name={name} value={v} defaultChecked={(value ?? "") === v} className="peer sr-only" />
          <span className="chip peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}
