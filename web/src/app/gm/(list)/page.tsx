import type { Metadata } from "next";
import Link from "next/link";
import { requireGm } from "@/lib/auth";
import { verifiedGmNeedsTwoStep } from "@/lib/two-step";
import { getI18n } from "@/lib/i18n/server";
import { countOpenRequestsForGm, getGmSettings, gmDashboardStats, gmOnboarding, listGmGames } from "@/lib/queries";
import { formatIdr } from "@/lib/policy";
import { countAwaitingForGm } from "@/lib/questions";
import { EmptyState, Stars, Thumb, priceLabel, Notice } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.gmDashboard") };
}

export default async function GmDashboardPage() {
  const gm = await requireGm();
  const hasProfile = !!getGmSettings(gm.id)?.headline; // the public page exists once the profile is filled in
  const awaitingQuestions = countAwaitingForGm(gm.id);
  const { t } = await getI18n();
  const stats = gmDashboardStats(gm.id);
  const games = listGmGames(gm.id, true);
  const openRequests = countOpenRequestsForGm(gm.id);
  const ob = gmOnboarding(gm.id);
  const steps = [
    { done: ob.profile, label: t("onboard.profile"), href: "/become-a-gm" },
    { done: ob.payment, label: t("onboard.payment"), href: "/become-a-gm" },
    { done: gm.email_verified, label: t("onboard.verify"), href: "/settings" },
    { done: ob.published, label: t("onboard.publish"), href: ob.firstGame ? `/gm/games/${ob.firstGame.id}/edit` : "/gm/games/new" },
    { done: ob.session, label: t("onboard.session"), href: ob.firstGame ? `/gm/games/${ob.firstGame.id}` : "/gm/games/new" },
    { done: ob.booking, label: t("onboard.booking"), href: ob.firstGame ? `/games/${ob.firstGame.slug}` : "/gm/games/new" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const needsTwoStep = verifiedGmNeedsTwoStep(gm.id);
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {needsTwoStep && (
        <div className="mb-5"><Notice tone="danger">{t("gm.twoStepRequired")} <Link href="/settings#two-step" className="font-semibold underline">{t("gm.twoStepRequiredLink")}</Link></Notice></div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("nav.gmDashboard")}</h1>
          <p className="mt-1 text-muted">
            {t("gmDash.lead")}{" "}
            {hasProfile && <><Link href={`/gms/${gm.id}`} className="text-accent hover:underline">{t("gmDash.viewProfile")}</Link> ·{" "}</>}
            <Link href="/become-a-gm" className="text-accent hover:underline">{t("gmDash.editProfile")}</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/gm/earnings" className="btn-secondary"><Icon name="coins" /> {t("earnings.title")}</Link>
          <Link href="/gm/questions" className="btn-secondary">
            <Icon name="comment-dots" /> {awaitingQuestions > 0 ? t("gmQuestions.buttonAwaiting", { n: awaitingQuestions }) : t("gmQuestions.title")}
          </Link>
          <Link href="/gm/requests" className="btn-secondary">
            <Icon name="inbox" /> {t("gmRequests.title")}
            {openRequests > 0 && <span className="rounded-full bg-accent px-2 text-xs font-bold text-accent-ink">{openRequests}</span>}
          </Link>
          <Link href="/gm/games/new" className="btn-primary"><Icon name="plus" /> {t("gmDash.newGame")}</Link>
        </div>
      </div>

      {doneCount < steps.length && (
        <section className="card mt-8 p-5" aria-labelledby="onboard-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="onboard-h" className="text-lg font-bold">{t("onboard.title")}</h2>
            <span className="text-sm text-muted">{t("onboard.progress", { done: doneCount, total: steps.length })}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.label}>
                {s.done ? (
                  <span className="flex items-center gap-2 text-sm text-muted line-through"><Icon name="check-circle" solid className="text-success" /> {s.label}</span>
                ) : (
                  <Link href={s.href} className="flex items-center gap-2 text-sm font-semibold text-accent hover:underline"><Icon name="arrow-right" /> {s.label}</Link>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">{t("onboard.hint")}</p>
        </section>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {/* Each number opens its details: the games list (sessions and seats are on each row), or earnings. */}
        <Stat href="#your-games" icon="dice-d20" label={t("gmDash.liveGames")} value={String(stats.live_games)} />
        <Stat href="#your-games" icon="calendar-clock" label={t("gmDash.upcomingSessions")} value={String(stats.upcoming_sessions)} />
        <Stat href="#your-games" icon="users" label={t("gmDash.playersBooked")} value={String(stats.upcoming_players)} />
        <Stat href="/gm/earnings" icon="wallet" label={t("gmDash.expectedIncome")} value={formatIdr(stats.expected_income_idr)} hint={t("gmDash.expectedHint")} />
      </dl>

      <h2 id="your-games" className="mt-12 mb-4 scroll-mt-24 text-xl font-bold">{t("gmDash.yourGames")}</h2>
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

/** A summary number (28px) that opens the details behind it. */
function Stat({ href, icon, label, value, hint }: { href: string; icon: RegularIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="card relative p-5 transition-colors hover:border-accent/50">
      <dt className="flex items-center gap-2 text-sm font-semibold text-muted">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-bold tabular-nums">
        <Link href={href} className="after:absolute after:inset-0 after:rounded-xl hover:text-accent">{value}</Link>
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted">{hint}</dd>}
    </div>
  );
}
