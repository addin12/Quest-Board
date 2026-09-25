import type { Metadata } from "next";
import Link from "next/link";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { countOpenRequestsForGm, gmDashboardStats, listGmGames } from "@/lib/queries";
import { formatIdr } from "@/lib/policy";
import { EmptyState, Stars, Thumb, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.gmDashboard") };
}

export default async function GmDashboardPage() {
  const gm = await requireGm();
  const { t } = await getI18n();
  const stats = gmDashboardStats(gm.id);
  const games = listGmGames(gm.id, true);
  const openRequests = countOpenRequestsForGm(gm.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("nav.gmDashboard")}</h1>
          <p className="mt-1 text-muted">
            {t("gmDash.lead")} <Link href={`/gms/${gm.id}`} className="text-accent hover:underline">{t("gmDash.viewProfile")}</Link> ·{" "}
            <Link href="/become-a-gm" className="text-accent hover:underline">{t("gmDash.editProfile")}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gm/requests" className="btn-secondary">
            <Icon name="inbox" /> {t("gmRequests.title")}
            {openRequests > 0 && <span className="rounded-full bg-accent px-2 text-xs font-bold text-accent-ink">{openRequests}</span>}
          </Link>
          <Link href="/gm/games/new" className="btn-primary"><Icon name="plus" /> {t("gmDash.newGame")}</Link>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon="dice-d20" label={t("gmDash.liveGames")} value={String(stats.live_games)} />
        <Stat icon="calendar-clock" label={t("gmDash.upcomingSessions")} value={String(stats.upcoming_sessions)} />
        <Stat icon="users" label={t("gmDash.playersBooked")} value={String(stats.upcoming_players)} />
        <Stat icon="wallet" label={t("gmDash.expectedIncome")} value={formatIdr(stats.expected_income_idr)} hint={t("gmDash.expectedHint")} />
      </dl>

      <h2 className="mt-12 mb-4 text-xl font-bold">{t("gmDash.yourGames")}</h2>
      {games.length === 0 ? (
        <EmptyState title={t("gmDash.emptyTitle")}>
          <p>{t("gmDash.emptyBody")}</p>
          <Link href="/gm/games/new" className="btn-primary mt-4"><Icon name="plus" /> {t("gmDash.createGame")}</Link>
        </EmptyState>
      ) : (
        <div className="card divide-y divide-border">
          {games.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-4 p-4">
              <Thumb hue={g.cover_hue} image={g.cover_image} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {g.title}
                  {g.status === "draft" && <span className="chip ml-2">{t("status.draft")}</span>}
                </p>
                <p className="text-sm text-muted">
                  {g.system} · {t(g.format === "campaign" ? "format.campaign" : "format.one_shot")} · {priceLabel(g.price_idr, t)} ·{" "}
                  {g.next_session_at ? (
                    <>{t("card.next")} <LocalTime iso={g.next_session_at} /> ({g.next_session_seats_taken}/{g.seats_total})</>
                  ) : (
                    t("card.noSessions")
                  )}
                </p>
              </div>
              <Stars rating={g.avg_rating} count={g.review_count} t={t} />
              <div className="flex gap-2">
                <Link href={`/gm/games/${g.id}`} className="btn-secondary py-1.5!"><Icon name="pencil" /> {t("gmDash.manage")}</Link>
                <Link href={`/games/${g.slug}`} className="btn-ghost py-1.5!"><Icon name="eye" /> {t("gmDash.view")}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: RegularIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <dt className="eyebrow flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}
