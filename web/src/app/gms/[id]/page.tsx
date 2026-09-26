import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { countGames, getGmProfile, listGmGames, listGmReviews } from "@/lib/queries";
import { isOnlineLocation, splitList } from "@/lib/policy";
import { Avatar, EmptyState, GameCard, Stars, VerifiedBadge } from "@/components/ui";
import { Icon } from "@/components/icon";
import { ShareButtons } from "@/components/share-buttons";
import { ReportButton } from "@/components/report-button";
import { FollowGmButton } from "@/components/social-buttons";
import { followerCount, isFollowing } from "@/lib/community";
import { getCurrentUser } from "@/lib/auth";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata(props: PageProps<"/gms/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const gm = getGmProfile(Number(id));
  const { t } = await getI18n();
  return gm ? { title: t("profile.metaTitle", { name: gm.name }), description: gm.headline } : {};
}

export default async function GmProfilePage(props: PageProps<"/gms/[id]">) {
  const { id } = await props.params;
  const { t } = await getI18n();
  const gm = getGmProfile(Number(id));
  if (!gm) notFound();
  // A profile shows the newest dozen; the rest are one click away (paged browse list).
  const games = listGmGames(gm.id, false, 12);
  const totalGames = games.length < 12 ? games.length : countGames({ gm: gm.id });
  const reviews = listGmReviews(gm.id);

  const viewer = await getCurrentUser();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <Avatar name={gm.name} hue={gm.avatar_hue} image={gm.avatar_image} size={112} />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">
            {gm.name} {gm.verified ? <VerifiedBadge label={t("common.verifiedGm")} className="align-[-2px] text-2xl" /> : null}
          </h1>
          <p className="flex items-center gap-2 text-lg text-muted"><Icon name="hat-wizard" /> {gm.headline}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Stars rating={gm.avg_rating} count={gm.review_count} t={t} size="lg" />
            <span className="inline-flex items-center gap-1.5"><Icon name="users" className="text-muted" /><strong>{gm.seats_played}</strong> <span className="text-muted">{t("profile.seatsPlayed")}</span></span>
            <span className="inline-flex items-center gap-1.5"><Icon name="graduation-cap" className="text-muted" /><strong>{gm.years_experience}</strong> <span className="text-muted">{t("profile.years")}</span></span>
            <span className="inline-flex items-center gap-1.5 text-muted">
              <Icon name={isOnlineLocation(gm.location) ? "laptop" : "marker"} /> {t("profile.location")}: {isOnlineLocation(gm.location) ? t("loc.online") : gm.location}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {splitList(gm.systems).map((s) => (
              <Link key={s} href={`/games?system=${encodeURIComponent(s)}`} className="chip gap-1 hover:text-accent"><Icon name="dice-d20" /> {s}</Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Link href={`/hire-a-gm/request?gm=${gm.id}`} className="btn-primary"><Icon name="briefcase" /> {t("hire.requestThisGm")}</Link>
          <ShareButtons url={`${await siteOrigin()}/gms/${gm.id}`} text={t("share.gmText", { name: gm.name })} />
          {viewer && viewer.id !== gm.id && <FollowGmButton gmId={gm.id} following={isFollowing(viewer.id, gm.id)} count={followerCount(gm.id)} t={t} />}
          {viewer && viewer.id !== gm.id && <ReportButton targetType="user" targetId={gm.id} />}
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div>
          <section>
            <h2 className="text-xl font-bold">{t("profile.about")}</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed">{gm.bio || t("profile.noBio")}</p>
          </section>
          <section className="mt-10">
            <h2 className="mb-4 text-xl font-bold">{t("profile.gamesBy", { name: gm.name.split(" ")[0] })}</h2>
            {games.length === 0 ? (
              <EmptyState title={t("profile.noGames")} />
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  {games.map((g) => <GameCard key={g.id} game={g} t={t} />)}
                </div>
                {totalGames > games.length && (
                  <p className="mt-6 text-center">
                    <Link href={`/games?gm=${gm.id}`} className="btn-secondary">{t("browse.seeAll", { n: totalGames })} <Icon name="arrow-right" /></Link>
                  </p>
                )}
              </>
            )}
          </section>
        </div>
        <aside>
          <h2 className="text-xl font-bold">{t("profile.recentReviews")}</h2>
          {reviews.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{t("common.noReviews")}</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="card p-4">
                  <p className="flex gap-0.5 text-sm text-gold" role="img" aria-label={t("reviews.starsLabel", { n: r.rating })}>{Array.from({ length: r.rating }, (_, i) => <Icon key={i} name="star" solid />)}</p>
                  {r.body && <p className="mt-1 text-sm">“{r.body}”</p>}
                  <p className="mt-2 text-xs text-muted">
                    {shownName(r.player_name, t)} · <Link href={`/games/${r.game_slug}`} className="hover:text-accent">{r.game_title}</Link>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
