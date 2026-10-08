import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { listSystemsInUse, searchGms, type GmFilters } from "@/lib/queries";
import { GENRES, MECHANICS, STYLES, genreIcon, genreLabelKey, isGenre, isMechanic, isStyle, styleIcon, styleLabelKey } from "@/lib/categories";
import type { MsgKey } from "@/lib/i18n/dict";
import type { RegularIcon } from "@/lib/icons";
import { EmptyState } from "@/components/ui";
import { GmCard } from "@/components/gm-card";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("hire.title"), description: t("hire.lead") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HireAGmPage(props: PageProps<"/hire-a-gm">) {
  const { t } = await getI18n();
  const sp = await props.searchParams;
  const filters: GmFilters = {
    q: one(sp.q).slice(0, 80) || undefined,
    system: one(sp.system) || undefined,
    genre: isGenre(one(sp.genre)) ? one(sp.genre) : undefined,
    style: isStyle(one(sp.style)) ? one(sp.style) : undefined,
    mechanic: isMechanic(one(sp.mechanic)) ? one(sp.mechanic) : undefined,
    where: one(sp.where).slice(0, 60) || undefined,
    language: one(sp.language) || undefined,
    verified: one(sp.verified) === "1",
  };
  const filtered = Object.values(filters).some(Boolean);
  const gms = searchGms(filters);
  const all = filtered ? searchGms({}) : gms;
  const systems = listSystemsInUse();
  const hosted = all.reduce((n, g) => n + g.sessions_hosted, 0);
  const rated = all.filter((g) => g.avg_rating != null);
  const avg = rated.length ? rated.reduce((n, g) => n + (g.avg_rating ?? 0), 0) / rated.length : null;

  const ways: [RegularIcon, MsgKey, MsgKey, string, MsgKey][] = [
    ["user", "hire.waySoloTitle", "hire.waySoloBody", "/games", "hire.waySoloCta"],
    ["users-alt", "hire.wayFriendsTitle", "hire.wayFriendsBody", "/games?sort=soonest", "hire.wayFriendsCta"],
    ["briefcase", "hire.wayPrivateTitle", "hire.wayPrivateBody", "/hire-a-gm/request", "hire.wayPrivateCta"],
  ];
  const why: [RegularIcon, MsgKey, MsgKey][] = [
    ["calendar-clock", "hire.why1Title", "hire.why1Body"],
    ["magic-wand", "hire.why2Title", "hire.why2Body"],
    ["star", "hire.why3Title", "hire.why3Body"],
    ["wallet", "hire.why4Title", "hire.why4Body"],
  ];
  const uses: [RegularIcon, MsgKey, MsgKey][] = [
    ["users-alt", "hire.use1Title", "hire.use1Body"],
    ["briefcase", "hire.use2Title", "hire.use2Body"],
    ["family", "hire.use3Title", "hire.use3Body"],
    ["party-horn", "hire.use4Title", "hire.use4Body"],
  ];
  const faqs = [1, 2, 3, 4, 5, 6] as const;

  return (
    <>
      {/* Hero */}
      <section className="on-wood relative overflow-hidden border-b-2 border-[#8a6a3a] bg-[#1b1008]">
        <Image src="/images/tavern/hero.svg" alt="" fill priority sizes="100vw" className="object-cover object-[85%_center] opacity-70" />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-[#140b05]/95 via-[#140b05]/80 to-[#140b05]/40" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-accent"><Icon name="briefcase" /> {t("hire.eyebrow")}</p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">{t("hire.title")}</h1>
            <p className="mt-4 max-w-xl text-lg text-text/90">{t("hire.lead")}</p>
            <div className="mt-7 flex flex-wrap gap-2">
              <Link href="/hire-a-gm/request" className="btn-primary px-5! py-3! text-base!"><Icon name="paper-plane" /> {t("hire.ctaRequest")}</Link>
              <Link href="#directory" className="btn-secondary px-5! py-3! text-base!"><Icon name="search" /> {t("hire.ctaBrowse")}</Link>
            </div>
          </div>
          {/* Numbers only once there are enough GMs for them to mean something. */}
          {all.length >= 3 && (
          <dl className="grid grid-cols-3 gap-3 self-center">
            <Stat icon="hat-wizard" value={String(all.length)} label={t("hire.statGms")} />
            <Stat icon="dice-d20" value={String(hosted)} label={t("hire.statSessions")} />
            <Stat icon="star" value={avg ? avg.toFixed(1) : "—"} label={t("hire.statRating")} />
          </dl>
          )}
        </div>
      </section>

      {/* Three ways */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <h2 className="text-2xl font-bold">{t("hire.waysTitle")}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {ways.map(([icon, title, body, href, cta], i) => (
            <div key={title} className={`card flex flex-col p-5 ${i === 2 ? "border-accent/50!" : ""}`}>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent"><Icon name={icon} /></span>
              <h3 className="mt-3 text-lg font-semibold">{t(title)}</h3>
              <p className="mt-1 flex-1 text-sm text-muted">{t(body)}</p>
              <Link href={href} className={`${i === 2 ? "btn-primary" : "btn-secondary"} mt-4 self-start`}>{t(cta)} <Icon name="arrow-right" /></Link>
            </div>
          ))}
        </div>
      </section>

      {/* Directory */}
      <section id="directory" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-14">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("hire.directoryTitle")}</h2>
          <p className="text-sm text-muted">{t("hire.directoryCount", { n: gms.length })}</p>
        </div>
        <form className="card mt-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label={t("hire.filters")} action="/hire-a-gm#directory">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="label">{t("common.search")}</label>
            <input id="q" name="q" defaultValue={filters.q} className="input" placeholder={t("hire.searchPh")} />
          </div>
          <Select id="system" label={t("browse.system")} value={filters.system} any={t("browse.anySystem")} options={systems.map((s) => [s.system, s.system])} />
          <Select id="genre" label={t("browse.genre")} value={filters.genre} any={t("common.any")} options={GENRES.map((g) => [g.key, t(genreLabelKey(g.key))])} />
          <Select id="style" label={t("browse.style")} value={filters.style} any={t("common.any")} options={STYLES.map((s) => [s.key, t(styleLabelKey(s.key))])} />
          <Select id="mechanic" label={t("browse.mechanic")} value={filters.mechanic} any={t("browse.allMechanics")} options={MECHANICS.map((m) => [m.key, m.name])} />
          <Select id="language" label={t("browse.language")} value={filters.language} any={t("common.any")} options={[["id", "Bahasa Indonesia"], ["en", "English"]]} />
          <div className="lg:col-span-2">
            <label htmlFor="where" className="label">{t("browse.where")}</label>
            <input id="where" name="where" list="where-options" defaultValue={filters.where} className="input" placeholder={t("hire.wherePh")} />
            <datalist id="where-options"><option value="online" /><option value="Jakarta" /><option value="Bandung" /><option value="Yogyakarta" /><option value="Surabaya" /></datalist>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm lg:col-span-2">
            <input type="checkbox" name="verified" value="1" defaultChecked={filters.verified} className="accent-[var(--accent)]" /> {t("hire.verifiedOnly")}
          </label>
          <div className="flex gap-2 self-end lg:col-span-2">
            <button type="submit" className="btn-primary flex-1"><Icon name="filter" /> {t("browse.apply")}</button>
            {filtered && <Link href="/hire-a-gm#directory" className="btn-secondary">{t("browse.clear")}</Link>}
          </div>
        </form>
        <div className="mt-6">
          {gms.length === 0 ? (
            <EmptyState title={t(filtered ? "hire.noGmsTitle" : "hire.noGmsYetTitle")}>
              <p>{t(filtered ? "hire.noGmsBody" : "hire.noGmsYetBody")}</p>
              <Link href="/hire-a-gm/request" className="btn-primary mt-4"><Icon name="paper-plane" /> {t("hire.ctaRequest")}</Link>
            </EmptyState>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{gms.map((g) => <GmCard key={g.id} gm={g} t={t} />)}</div>
          )}
        </div>
      </section>

      {/* Browse by genre / style */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="grid gap-8 md:grid-cols-2">
          <ChipGroup title={t("browse.genres")} href="/browse#genres" more={t("browse.allGenres")}>
            {GENRES.slice(0, 12).map((g) => (
              <Link key={g.key} href={`/hire-a-gm?genre=${g.key}#directory`} className="chip gap-1 hover:border-accent hover:text-accent"><Icon name={genreIcon(g.key)} /> {t(genreLabelKey(g.key))}</Link>
            ))}
          </ChipGroup>
          <ChipGroup title={t("browse.styles")} href="/browse#styles" more={t("browse.allStyles")}>
            {STYLES.slice(0, 10).map((s) => (
              <Link key={s.key} href={`/hire-a-gm?style=${s.key}#directory`} className="chip gap-1 hover:border-accent hover:text-accent"><Icon name={styleIcon(s.key)} /> {t(styleLabelKey(s.key))}</Link>
            ))}
          </ChipGroup>
        </div>
      </section>

      {/* Why + use cases */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <h2 className="text-2xl font-bold">{t("hire.whyTitle")}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {why.map(([icon, title, body]) => (
            <div key={title} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
              <h3 className="mt-3 font-semibold">{t(title)}</h3>
              <p className="mt-1 text-sm text-muted">{t(body)}</p>
            </div>
          ))}
        </div>
        <h2 className="mt-14 text-2xl font-bold">{t("hire.useTitle")}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {uses.map(([icon, title, body]) => (
            <div key={title} className="card flex gap-4 p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-xl text-accent"><Icon name={icon} /></span>
              <div>
                <h3 className="font-semibold">{t(title)}</h3>
                <p className="mt-1 text-sm text-muted">{t(body)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pt-14" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-2xl font-bold">{t("hire.faqTitle")}</h2>
        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
          {faqs.map((n) => (
            <details key={n} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {t(`hire.faq${n}Q` as MsgKey)}
                <Icon name="plus" className="shrink-0 text-muted transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-2 text-sm text-muted">{t(`hire.faq${n}A` as MsgKey)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 pt-14">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-accent p-8 text-accent-ink sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">{t("hire.finalTitle")}</h2>
            <p className="mt-1 opacity-90">{t("hire.finalBody")}</p>
          </div>
          <Link href="/hire-a-gm/request" className="btn shrink-0 bg-accent-ink text-accent hover:opacity-90"><Icon name="paper-plane" /> {t("hire.ctaRequest")}</Link>
        </div>
      </section>
    </>
  );
}

function Stat({ icon, value, label }: { icon: RegularIcon; value: string; label: string }) {
  return (
    <div className="card p-4">
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
        <span className="mt-2 block text-2xl font-bold">{value}</span>
        <span aria-hidden className="block text-xs text-muted">{label}</span>
      </dd>
    </div>
  );
}

function Select({ id, label, value, any, options }: { id: string; label: string; value?: string; any: string; options: [string, string][] }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} name={id} defaultValue={value ?? ""} className="input">
        <option value="">{any}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function ChipGroup({ title, href, more, children }: { title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">{more} <Icon name="arrow-right" /></Link>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
