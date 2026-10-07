import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotices } from "@/lib/community";
import { isNoticeKind } from "@/lib/board";
import { NoticeCard } from "@/components/notice-card";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("board.pageTitle"), description: t("board.lead") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The Tavern Notice Board: players looking for a group, groups looking for players. */
export default async function BoardPage(props: PageProps<"/board">) {
  const { t } = await getI18n();
  const sp = await props.searchParams;
  const kind = isNoticeKind(one(sp.kind)) ? (one(sp.kind) as "lf_group" | "lf_players") : undefined;
  const q = one(sp.q).slice(0, 80);
  const where = one(sp.where).slice(0, 60);
  const language = one(sp.language) === "en" ? "en" : one(sp.language) === "id" ? "id" : undefined;
  const notices = listNotices({ kind, q, where, language });
  const user = await getCurrentUser();
  const tabs = [
    { key: "", label: t("board.all") },
    { key: "lf_group", label: t("board.kindGroup") },
    { key: "lf_players", label: t("board.kindPlayers") },
  ];
  return (
    <div>
      <section className="on-wood wood-plank border-b-2 border-[#8a6a3a]">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <p className="eyebrow text-accent!">{t("board.eyebrow")}</p>
          <span aria-hidden className="ornament mt-3 w-40!" />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-extrabold sm:text-4xl"><Icon name="thumbtack" className="text-accent" /> {t("board.pageTitle")}</h1>
              <p className="mt-2 max-w-2xl text-text/90">{t("board.lead")}</p>
            </div>
            <Link href={user ? "/board/new" : "/login?next=/board/new"} className="btn-primary"><Icon name="thumbtack" /> {t("board.pinNew")}</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav aria-label={t("board.filterKind")} className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const active = (kind ?? "") === tab.key;
            const qs = new URLSearchParams({ ...(tab.key ? { kind: tab.key } : {}), ...(q ? { q } : {}), ...(where ? { where } : {}), ...(language ? { language } : {}) });
            return (
              <Link key={tab.key || "all"} href={`/board${qs.size ? `?${qs}` : ""}`} aria-current={active ? "page" : undefined} className={active ? "btn-primary px-3! py-1.5!" : "btn-secondary px-3! py-1.5!"}>
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <form className="mt-4 grid items-end gap-3 sm:grid-cols-[1fr_200px_180px_auto]" role="search" aria-label={t("board.filters")}>
          {kind && <input type="hidden" name="kind" value={kind} />}
          <div>
            <label htmlFor="bq" className="label">{t("board.searchLabel")}</label>
            <input id="bq" name="q" defaultValue={q} className="input" placeholder={t("board.searchPh")} />
          </div>
          <div>
            <label htmlFor="bwhere" className="label">{t("browse.where")}</label>
            <input id="bwhere" name="where" defaultValue={where} className="input" placeholder={t("hire.wherePh")} />
          </div>
          <div>
            <label htmlFor="blang" className="label">{t("browse.language")}</label>
            <select id="blang" name="language" defaultValue={language ?? ""} className="input">
              <option value="">{t("common.any")}</option>
              <option value="id">{t("lang.gameId")}</option>
              <option value="en">{t("lang.gameEn")}</option>
            </select>
          </div>
          <button className="btn-secondary"><Icon name="search" /> {t("browse.apply")}</button>
        </form>

        <div className="wood-plank on-wood mt-6 rounded-lg border-2 border-[#8a6a3a] p-5 shadow-inner sm:p-8">
          {notices.length === 0 ? (
            <div className="parchment notice mx-auto max-w-md p-8 text-center">
              <Icon name="thumbtack" solid className="text-2xl text-accent" />
              <p className="mt-2 text-lg font-bold">{t("board.emptyTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t(kind || q || where || language ? "board.emptyBody" : "board.emptyBodyNew")}</p>
              <Link href="/board/new" className="btn-primary mt-4"><Icon name="thumbtack" /> {t("board.pin")}</Link>
            </div>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {notices.map((n) => (
                <li key={n.id} className="parchment"><NoticeCard n={n} t={t} /></li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-4 text-xs text-muted">{t("board.expiryNote")}</p>
      </div>
    </div>
  );
}
