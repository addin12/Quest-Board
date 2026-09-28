import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import {
  canReview,
  getGameBySlug,
  isGameMember,
  listGameReviews,
  listMessages,
  listSessions,
  playerBookedSessionIds,
  playerRemovedSessionIds,
} from "@/lib/queries";
import { canBook, splitList } from "@/lib/policy";
import { Avatar, Cover, Stars, Notice, VerifiedBadge, languageLabel, priceLabel } from "@/components/ui";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";
import { genreIcon, genreLabelKey, isGenre, isStyle, mechanicsForSystem, parseCategoryCsv, styleIcon, styleLabelKey, systemSlug } from "@/lib/categories";
import { LocalTime } from "@/components/local-time";
import { MessageForm, ReviewForm, ReviewReplyForm } from "@/components/forms";
import { ShareButtons } from "@/components/share-buttons";
import { ReportButton } from "@/components/report-button";
import { ModRemoveButton } from "@/components/mod-remove-button";
import { ConfirmButton } from "@/components/submit-button";
import { deleteReviewAction } from "@/app/actions";
import { CalendarLinks } from "@/components/calendar-links";
import { AutoRefresh } from "@/components/auto-refresh";
import { googleCalendarUrl, sessionEvent } from "@/lib/calendar";
import { siteOrigin } from "@/lib/site";
import { gameEventsJsonLd, jsonLdString } from "@/lib/seo";
import { myWaitlist, refreshWaitlists } from "@/lib/waitlist";
import { WaitlistControls, WaitlistOffer } from "@/components/waitlist-controls";
import { SaveGameButton } from "@/components/social-buttons";
import { isSaved } from "@/lib/community";

export async function generateMetadata(props: PageProps<"/games/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const game = getGameBySlug(slug);
  if (!game) return {};
  return {
    title: game.title,
    description: game.summary,
    openGraph: { title: game.title, description: game.summary, type: "website", url: `/games/${game.slug}` },
  };
}

export default async function GamePage(props: PageProps<"/games/[slug]">) {
  const { slug } = await props.params;
  const { t } = await getI18n();
  const game = getGameBySlug(slug);
  const user = await getCurrentUser();
  const isOwner = !!user && (user.id === game?.gm_id || user.role === "admin");
  if (!game || (game.status !== "published" && !isOwner)) notFound();

  // Bring waitlists up to date (expired offers pass to the next person) before showing seats.
  refreshWaitlists(listSessions(game.id, { upcomingOnly: true }).map((s) => s.id));
  const sessions = listSessions(game.id, { upcomingOnly: true });
  const waits = user ? myWaitlist(user.id, game.id) : [];
  const reviews = listGameReviews(game.id);
  const booked = user ? playerBookedSessionIds(game.id, user.id) : [];
  const removed = user ? playerRemovedSessionIds(game.id, user.id) : [];
  const member = user ? isGameMember(game.id, user.id) : false;
  const reviewable = user ? canReview(game.id, user.id) : false;
  const messages = member ? listMessages(game.id) : [];
  const now = new Date();
  const origin = await siteOrigin();
  const gameUrl = `${origin}/games/${game.slug}`;
  const levelKey = game.experience_level === "beginner" ? "level.beginner" : game.experience_level === "experienced" ? "level.experienced" : "level.any";

  const events = game.status === "published" ? gameEventsJsonLd(game, sessions, origin) : [];

  return (
    <article>
      {events.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(events) }} />}
      <Cover hue={game.cover_hue} system={game.system} image={game.cover_image} className="h-48 sm:h-72" wide />
      <div className="mx-auto max-w-6xl px-4">
        {game.status !== "published" && (
          <div className="mt-4"><Notice>{t("game.hiddenNotice", { status: t(game.status === "draft" ? "status.draft" : "status.archived") })}</Notice></div>
        )}
        <div className="grid gap-10 py-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <span className="chip gap-1"><Icon name={game.format === "campaign" ? "scroll-old" : "book-open-cover"} />{t(game.format === "campaign" ? "format.campaign" : "format.one_shot")}</span>
              <span className="chip gap-1"><Icon name={game.location_type === "online" ? "laptop" : "marker"} />{game.location_type === "online" ? t("loc.online") : `${t("loc.inPerson")} · ${game.city}`}</span>
              <span className="chip gap-1"><Icon name="language" />{languageLabel(game.language, t)}</span>
              <span className="chip gap-1"><Icon name={game.experience_level === "beginner" ? "seedling" : "graduation-cap"} />{t(levelKey)}</span>
              <span className="chip gap-1"><Icon name="user" />{t("game.ages", { n: game.min_age })}</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{game.title}</h1>
            <p className="mt-2 text-lg text-muted">{game.summary}</p>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <Stars rating={game.avg_rating} count={game.review_count} t={t} size="lg" />
              {isOwner && <Link href={`/gm/games/${game.id}`} className="btn-secondary py-1!"><Icon name="pencil" /> {t("game.manage")}</Link>}
            </div>
            {game.status === "published" && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ShareButtons url={gameUrl} text={t("share.gameText", { title: game.title, system: game.system })} />
                  {user && user.id !== game.gm_id && <SaveGameButton gameId={game.id} slug={game.slug} saved={isSaved(user.id, game.id)} t={t} />}
                </div>
                {user && user.id !== game.gm_id && <ReportButton targetType="game" targetId={game.id} />}
                {user?.role === "admin" && game.status === "published" && <ModRemoveButton targetType="game" targetId={game.id} />}
              </div>
            )}

            <section className="mt-8">
              <h2 className="text-xl font-bold">{t("game.about")}</h2>
              <div className="mt-3 whitespace-pre-line leading-relaxed">{game.description}</div>
              {(game.genres || game.styles) && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {parseCategoryCsv(game.genres).filter(isGenre).map((g) => (
                    <Link key={g} href={`/browse/genre/${g}`} className="chip gap-1 border-accent/30! text-accent! hover:bg-accent-soft"><Icon name={genreIcon(g)} /> {t(genreLabelKey(g))}</Link>
                  ))}
                  {parseCategoryCsv(game.styles).filter(isStyle).map((s) => (
                    <Link key={s} href={`/browse/style/${s}`} className="chip gap-1 hover:text-accent"><Icon name={styleIcon(s)} /> {t(styleLabelKey(s))}</Link>
                  ))}
                  <Link href={`/browse/system/${systemSlug(game.system)}`} className="chip gap-1 hover:text-accent"><Icon name="dice-d20" /> {game.system}</Link>
                  {mechanicsForSystem(game.system).map((m) => (
                    <Link key={m.key} href={`/browse/mechanic/${m.key}`} className="chip gap-1 hover:text-accent" title={t("game.mechanics")}><Icon name={m.icon} /> {m.name}</Link>
                  ))}
                </div>
              )}
              {splitList(game.tags).length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {splitList(game.tags).map((tag) => (
                    <Link key={tag} href={`/games?q=${encodeURIComponent(tag)}`} className="chip hover:text-accent">#{tag}</Link>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8 grid gap-4 sm:grid-cols-2">
              <InfoBlock icon={game.location_type === "online" ? "laptop" : "marker"} title={t("game.where")}>
                {game.location_type === "online" ? game.platform || t("loc.online") : t("game.inPersonVenue", { city: game.city })}
              </InfoBlock>
              <InfoBlock icon="shield-check" title={t("game.safety")}>{game.safety_tools || t("game.safetyNone")}</InfoBlock>
              <InfoBlock icon="triangle-warning" title={t("game.cw")}>{game.content_warnings || t("game.cwNone")}</InfoBlock>
              <InfoBlock icon="handshake" title={t("game.paymentTitle")}>{t("game.paymentBody")}</InfoBlock>
            </section>

            {member && (
              <section className="mt-10" aria-labelledby="chat-h">
                <AutoRefresh />
                <h2 id="chat-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="comments" className="text-accent" /> {t("chat.title")}</h2>
                <p className="text-sm text-muted">{t("chat.visibility")}</p>
                <ul className="mt-4 space-y-3">
                  {messages.map((m) => (
                    <li key={m.id} className="flex gap-3">
                      <Avatar name={m.name} hue={m.avatar_hue} image={m.avatar_image} size={32} />
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-semibold">{shownName(m.name, t)}</span>
                          {m.is_gm ? <span className="ml-1.5 rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">GM</span> : null}
                          <span className="ml-2 text-xs text-muted"><LocalTime iso={m.created_at} /></span>
                        </p>
                        <p className="whitespace-pre-line text-sm">{m.body}</p>
                        {user && m.user_id !== user.id && <ReportButton targetType="message" targetId={m.id} className="mt-1" />}
                        {user?.role === "admin" && <ModRemoveButton targetType="message" targetId={m.id} className="mt-1" />}
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-4"><MessageForm gameId={game.id} /></div>
              </section>
            )}

            <section className="mt-10" aria-labelledby="reviews-h">
              <h2 id="reviews-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="star" className="text-gold" /> {t("reviews.title")}</h2>
              {reviewable && <div className="mt-4"><ReviewForm gameId={game.id} /></div>}
              {user && reviews.some((r) => r.player_id === user.id) && (
                <div className="mt-4"><Notice tone="success">{t("reviews.thanks")}</Notice></div>
              )}
              {reviews.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{t("common.noReviews")}</p>
              ) : (
                <ul className="mt-4 space-y-5">
                  {reviews.map((r) => (
                    <li key={r.id} className="flex gap-3">
                      <Avatar name={r.player_name} hue={r.player_hue} image={r.player_image} size={32} />
                      <div>
                        <p className="text-sm font-semibold">
                          {shownName(r.player_name, t)}{" "}
                          <Rating n={r.rating} label={t("reviews.starsLabel", { n: r.rating })} />
                        </p>
                        <p className="text-xs text-muted"><LocalTime iso={r.created_at} mode="date" />{r.edited_at && <> · {t("reviews.edited")}</>}</p>
                        {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                        {r.gm_reply && (
                          <div className="mt-2 rounded-lg border-l-2 border-accent bg-surface-2 px-3 py-2 text-sm">
                            <p className="text-xs font-semibold">{t("reviews.gmReply", { name: shownName(game.gm_name, t) })}</p>
                            <p className="mt-0.5 whitespace-pre-line">{r.gm_reply}</p>
                            {user && user.id !== game.gm_id && <ReportButton targetType="review_reply" targetId={r.id} className="mt-1" />}
                            {user?.role === "admin" && <ModRemoveButton targetType="review_reply" targetId={r.id} className="mt-1" />}
                          </div>
                        )}
                        {user?.id === r.player_id && (
                          <details className="mt-2">
                            <summary className="btn-ghost inline-flex cursor-pointer list-none px-2! py-1! text-xs [&::-webkit-details-marker]:hidden"><Icon name="pencil" /> {t("reviews.editTitle")}</summary>
                            <ReviewForm gameId={game.id} existing={{ id: r.id, rating: r.rating, body: r.body }} />
                            <form action={deleteReviewAction} className="mt-2">
                              <input type="hidden" name="reviewId" value={r.id} />
                              <ConfirmButton className="btn-ghost px-2! py-1! text-xs text-danger!" message={t("reviews.deleteConfirm")}><Icon name="trash" /> {t("reviews.delete")}</ConfirmButton>
                            </form>
                          </details>
                        )}
                        {user?.id === game.gm_id && <ReviewReplyForm reviewId={r.id} current={r.gm_reply} />}
                        {user && r.player_id !== user.id && <ReportButton targetType="review" targetId={r.id} className="mt-1" />}
                        {user?.role === "admin" && <ModRemoveButton targetType="review" targetId={r.id} className="mt-1" />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:h-fit">
            <div id="sessions" className="card scroll-mt-24 p-5">
              <p className="text-2xl font-bold">
                {priceLabel(game.price_idr, t)}
                {game.price_idr > 0 && <span className="text-sm font-normal text-muted"> / {t("common.session")}</span>}
              </p>
              <p className="text-sm text-muted">{t("game.seatsPerSession", { n: game.seats_total })}</p>
              {game.price_idr > 0 && <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><Icon name="percentage" /> {t("game.paidToGm")}</p>}
              <h2 className="eyebrow mt-5 flex items-center gap-1.5"><Icon name="calendar" /> {t("game.upcoming")}</h2>
              {sessions.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{t("game.noSessions")}</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {sessions.map((s) => {
                    const mine = booked.includes(s.id);
                    const wait = waits.find((w) => w.session_id === s.id);
                    const offered = wait?.status === "offered";
                    // Seats held by someone else's waitlist offer count as taken.
                    const heldForOthers = s.seats_held - (offered ? 1 : 0);
                    const left = game.seats_total - s.seats_taken - s.seats_held;
                    const verdict = canBook({
                      sessionStatus: s.status, gameStatus: game.status, startsAt: new Date(s.starts_at), now,
                      seatsTotal: game.seats_total, seatsTaken: s.seats_taken + heldForOthers, isGm: user?.id === game.gm_id, alreadyBooked: mine,
                      removedByGm: removed.includes(s.id),
                    });
                    const full = !verdict.ok && verdict.reason === "err.full" && !removed.includes(s.id);
                    return (
                      <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                        <div className="min-w-44 text-sm">
                          <p className="flex items-center gap-1.5 font-medium"><Icon name="calendar-clock" className="text-muted" /><LocalTime iso={s.starts_at} /></p>
                          <p className="text-xs text-muted">
                            {t("common.hours", { n: s.duration_minutes / 60 })} ·{" "}
                            {left <= 0 ? <span className="text-danger">{t("common.full")}</span> : t("game.seatsLeftOf", { left, total: game.seats_total })}
                          </p>
                          {mine && (
                            <div className="mt-1.5">
                              <CalendarLinks
                                compact
                                sessionId={s.id}
                                google={googleCalendarUrl(sessionEvent({ ...game, id: s.id, starts_at: s.starts_at, duration_minutes: s.duration_minutes }, origin, t))}
                                t={t}
                              />
                            </div>
                          )}
                        </div>
                        {mine ? (
                          <span className="chip gap-1 border-success/30! bg-success-soft! text-success!"><Icon name="check-circle" solid />{t("game.booked")}</span>
                        ) : verdict.ok && offered ? (
                          <WaitlistOffer sessionId={s.id} expiresAt={wait?.expires_at ?? null} t={t} />
                        ) : verdict.ok ? (
                          <Link href={`/book/${s.id}`} className="btn-primary gap-1.5! px-3! py-1.5!"><Icon name="ticket" /> {t("game.book")}</Link>
                        ) : full ? (
                          <WaitlistControls sessionId={s.id} slug={game.slug} wait={wait} signedIn={!!user} t={t} />
                        ) : (
                          <span className="text-xs text-muted" title={t(verdict.reason)}>
                            {user?.id === game.gm_id ? t("game.yourTable") : verdict.reason === "err.removedByGm" ? t("game.seatReleased") : left <= 0 ? t("common.full") : t("game.unavailable")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {member && user?.id !== game.gm_id && (
              <div className="card border-accent/40! p-5">
                <h2 className="eyebrow flex items-center gap-1.5 text-accent!"><Icon name="wallet" /> {t("game.howToPay")}</h2>
                <p className="mt-2 whitespace-pre-line text-sm">{game.gm_payment_info || t("game.howToPayEmpty")}</p>
                <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-xs text-muted">
                  <Icon name="shield-check" className="mt-0.5 shrink-0 text-accent" /> {t("game.scamWarning")}
                </p>
              </div>
            )}

            <div className="card p-5">
              <h2 className="eyebrow flex items-center gap-1.5"><Icon name="hat-wizard" /> {t("game.yourGm")}</h2>
              <Link href={`/gms/${game.gm_id}`} className="mt-3 flex items-center gap-3 hover:text-accent">
                <Avatar name={game.gm_name} hue={game.gm_hue} image={game.gm_image} size={56} />
                <span>
                  <span className="block font-semibold">
                    {game.gm_name} {game.gm_verified ? <VerifiedBadge label={t("common.verifiedGm")} className="align-[-2px]" /> : null}
                  </span>
                  <span className="block text-sm text-muted">{game.gm_headline}</span>
                </span>
              </Link>
              <p className="mt-3 line-clamp-4 text-sm text-muted">{game.gm_bio}</p>
              {user?.id !== game.gm_id && game.status === "published" && (
                <Link href={`/games/${game.slug}/ask`} className="btn-secondary mt-4 w-full"><Icon name="comment-dots" /> {t("ask.button")}</Link>
              )}
            </div>
          </aside>
        </div>
      </div>
      {/* Phones and tablets: the booking card sits below the whole description, so keep a way to it in reach. */}
      {sessions.length > 0 && !isOwner && (
        <>
          <div className="h-16 lg:hidden" aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-2.5 shadow-[0_-4px_12px_rgb(0_0_0/0.12)] backdrop-blur md:bottom-0 lg:hidden">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <p className="min-w-0 text-sm">
                <span className="font-bold">{priceLabel(game.price_idr, t)}</span>
                {game.price_idr > 0 && <span className="text-muted"> / {t("common.session")}</span>}
                <span className="block truncate text-xs text-muted">{t("game.stickyUpcoming", { n: sessions.length })}</span>
              </p>
              <a href="#sessions" className="btn-primary shrink-0"><Icon name="ticket" /> {t("game.stickySeeDates")}</a>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function InfoBlock({ icon, title, children }: { icon: RegularIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex gap-3 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
      <div className="min-w-0">
        <h3 className="eyebrow">{title}</h3>
        <p className="mt-1 text-sm">{children}</p>
      </div>
    </div>
  );
}

function Rating({ n, label }: { n: number; label: string }) {
  return (
    <span className="ml-1 inline-flex gap-0.5 align-[-1px] text-xs text-gold" role="img" aria-label={label}>
      {Array.from({ length: n }, (_, i) => <Icon key={i} name="star" solid />)}
    </span>
  );
}
