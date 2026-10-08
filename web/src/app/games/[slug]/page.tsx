import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPrelaunch } from "@/lib/prelaunch";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { PaymentChangedNote } from "@/components/payment-changed-note";
import {
  canReview,
  getGameBySlug,
  isGameMember,
  listGameReviews,
  listMessages,
  CHAT_MAX,
  CHAT_PAGE,
  listSessions,
  playerBookedSessionIds,
  playerRemovedSessionIds,
} from "@/lib/queries";
import { canBook, splitList } from "@/lib/policy";
import { Avatar, Cover, NewGmBadge, Stars, Notice, VerifiedBadge, languageLabel, priceLabel } from "@/components/ui";
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
import { NewMessageAnnouncer } from "@/components/new-message-announcer";
import { changeVersion } from "@/lib/changes";
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
  const sp = await props.searchParams;
  const allChat = sp.chat === "all";
  const { t } = await getI18n();
  const game = getGameBySlug(slug);
  const user = await getCurrentUser();
  const isOwner = !!user && (user.id === game?.gm_id || user.admin);
  if (!game || (game.status !== "published" && !isOwner)) notFound();
  // "See it as a player" (the GM only, ?preview=visitor|player): the page as a visitor sees it, or as a player
  // with a seat — how to pay, the QRIS code and the table link included. Nothing in it acts as the GM.
  const preview = user && user.id === game.gm_id && (sp.preview === "visitor" || sp.preview === "player") ? sp.preview : null;
  const viewer = preview ? null : user;
  const ownerView = isOwner && !preview;

  // Bring waitlists up to date (expired offers pass to the next person) before showing seats.
  refreshWaitlists(listSessions(game.id, { upcomingOnly: true }).map((s) => s.id));
  const sessions = listSessions(game.id, { upcomingOnly: true });
  const waits = viewer ? myWaitlist(viewer.id, game.id) : [];
  const reviews = listGameReviews(game.id);
  const booked = preview === "player" ? sessions.slice(0, 1).map((x) => x.id) : viewer ? playerBookedSessionIds(game.id, viewer.id) : [];
  const soon = isPrelaunch();
  const removed = viewer ? playerRemovedSessionIds(game.id, viewer.id) : [];
  const member = preview === "player" || (viewer ? isGameMember(game.id, viewer.id) : false);
  const reviewable = viewer ? canReview(game.id, viewer.id) : false;
  // The newest CHAT_PAGE messages (one more tells us there are earlier ones), or up to CHAT_MAX.
  const fetched = member ? listMessages(game.id, allChat ? CHAT_MAX : CHAT_PAGE + 1) : [];
  const moreChat = !allChat && fetched.length > CHAT_PAGE;
  const messages = moreChat ? fetched.slice(1) : fetched;
  const now = new Date();
  const origin = await siteOrigin();
  const gameUrl = `${origin}/games/${game.slug}`;
  const levelKey = game.experience_level === "beginner" ? "level.beginner" : game.experience_level === "experienced" ? "level.experienced" : "level.any";

  const events = game.status === "published" ? gameEventsJsonLd(game, sessions, origin) : [];

  return (
    <article>
      {events.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(events) }} />}
      <div className="mx-auto max-w-6xl px-4 pt-6">
        {preview && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-sm" role="status" data-testid="preview-banner">
            <p className="flex items-start gap-2"><Icon name="eye" className="mt-0.5 shrink-0 text-accent" /> {t(preview === "player" ? "preview.asPlayer" : "preview.asVisitor")}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/games/${game.slug}?preview=${preview === "player" ? "visitor" : "player"}`} className="btn-secondary py-1!">{t(preview === "player" ? "preview.switchVisitor" : "preview.switchPlayer")}</Link>
              <Link href={`/games/${game.slug}`} className="btn-ghost py-1!">{t("preview.exit")}</Link>
            </div>
          </div>
        )}
        {game.status !== "published" && (
          <div className="mt-4"><Notice>{t("game.hiddenNotice", { status: t(game.status === "draft" ? "status.draft" : "status.archived") })}</Notice></div>
        )}
        <div className="grid gap-10 py-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            {/* The cover is a 4:5 poster (like an Instagram post): beside the title, or above it on phones. */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Cover hue={game.cover_hue} system={game.system} image={game.cover_image} priority sizes="(min-width: 640px) 256px, 100vw" className="aspect-[4/5] w-3/4 max-w-xs shrink-0 self-center rounded-xl border border-border sm:w-56 sm:self-start lg:w-64" />
            <div className="min-w-0 flex-1">
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
              {ownerView && <Link href={`/gm/games/${game.id}`} className="btn-secondary py-1!"><Icon name="pencil" /> {t("game.manage")}</Link>}
              {ownerView && viewer?.id === game.gm_id && <Link href={`/games/${game.slug}?preview=player`} className="btn-ghost py-1!"><Icon name="eye" /> {t("preview.open")}</Link>}
            </div>
            {game.status === "published" && (
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ShareButtons url={gameUrl} text={t("share.gameText", { title: game.title, system: game.system })} />
                  {viewer && viewer.id !== game.gm_id && <SaveGameButton gameId={game.id} slug={game.slug} saved={isSaved(viewer.id, game.id)} t={t} />}
                </div>
                {viewer && viewer.id !== game.gm_id && <ReportButton targetType="game" targetId={game.id} />}
                {viewer?.admin && game.status === "published" && <ModRemoveButton targetType="game" targetId={game.id} />}
              </div>
            )}
            </div>
            </div>

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
                {game.location_type === "online" ? game.platform || t("loc.online") : game.venue_name ? (
                  <>
                    <span className="block font-semibold">{game.venue_name}</span>
                    <span className="block text-muted">{game.city}</span>
                  </>
                ) : t("game.inPersonVenue", { city: game.city })}
                {game.location_type === "in_person" && game.venue_maps_url && (
                  <a href={game.venue_maps_url} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary mt-3" data-testid="venue-maps">
                    <Icon name="marker" /> {t("game.openMaps")}
                  </a>
                )}
              </InfoBlock>
              <InfoBlock icon="shield-check" title={t("game.safety")}>{game.safety_tools || t("game.safetyNone")}</InfoBlock>
              <InfoBlock icon="triangle-warning" title={t("game.cw")}>{game.content_warnings || t("game.cwNone")}</InfoBlock>
              <InfoBlock icon="handshake" title={t("game.paymentTitle")}>{t("game.paymentBody")}</InfoBlock>
            </section>

            {member && !preview && (
              <section className="mt-10" aria-labelledby="chat-h">
                <AutoRefresh watch="chat" id={game.id} version={changeVersion("chat", game.id, viewer?.id ?? null)} />
                <NewMessageAnnouncer lastId={messages.at(-1)?.id ?? 0} author={messages.length ? shownName(messages[messages.length - 1].name, t) : ""} fromMe={messages.at(-1)?.user_id === viewer?.id} />
                <h2 id="chat-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="comments" className="text-accent" /> {t("chat.title")}</h2>
                <p className="text-sm text-muted">{t("chat.visibility")}</p>
                {moreChat && (
                  <p className="mt-3 text-sm"><Link href={`/games/${game.slug}?chat=all#chat-h`} scroll={false} className="font-semibold text-accent hover:underline">{t("chat.showEarlier")}</Link></p>
                )}
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
                        {viewer && m.user_id !== viewer.id && <ReportButton targetType="message" targetId={m.id} className="mt-1" />}
                        {viewer?.admin && <ModRemoveButton targetType="message" targetId={m.id} className="mt-1" />}
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
              {viewer && reviews.some((r) => r.player_id === viewer.id) && (
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
                            {viewer && viewer.id !== game.gm_id && <ReportButton targetType="review_reply" targetId={r.id} className="mt-1" />}
                            {viewer?.admin && <ModRemoveButton targetType="review_reply" targetId={r.id} className="mt-1" />}
                          </div>
                        )}
                        {viewer?.id === r.player_id && (
                          <details className="mt-2">
                            <summary className="btn-ghost inline-flex cursor-pointer list-none px-2! py-1! text-xs [&::-webkit-details-marker]:hidden"><Icon name="pencil" /> {t("reviews.editTitle")}</summary>
                            <ReviewForm gameId={game.id} existing={{ id: r.id, rating: r.rating, body: r.body }} />
                            <form action={deleteReviewAction} className="mt-2">
                              <input type="hidden" name="reviewId" value={r.id} />
                              <ConfirmButton className="btn-ghost px-2! py-1! text-xs text-danger!" message={t("reviews.deleteConfirm")}><Icon name="trash" /> {t("reviews.delete")}</ConfirmButton>
                            </form>
                          </details>
                        )}
                        {viewer?.id === game.gm_id && <ReviewReplyForm reviewId={r.id} current={r.gm_reply} />}
                        {viewer && r.player_id !== viewer.id && <ReportButton targetType="review" targetId={r.id} className="mt-1" />}
                        {viewer?.admin && <ModRemoveButton targetType="review" targetId={r.id} className="mt-1" />}
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
              {game.price_idr > 0 && <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted"><Icon name="wallet" /> {t("game.paidToGm")}</p>}
              {/* Payments go straight to the GM, so their refund terms come before anyone books. */}
              <div className="mt-3 border-t border-border pt-3 text-sm" data-testid="refund-terms">
                <p className="font-semibold">{t("game.refundTitle")}</p>
                <p className="mt-1 whitespace-pre-line text-muted">{game.gm_refund_terms || t("game.refundNone")}</p>
              </div>
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
                      seatsTotal: game.seats_total, seatsTaken: s.seats_taken + heldForOthers, isGm: viewer?.id === game.gm_id, alreadyBooked: mine,
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
                        ) : soon ? (
                          // Pre-launch (GMs first): no booking or waitlist yet, just where to leave an email.
                          <Link href="/opening" className="text-xs font-semibold text-accent hover:underline">{t("prelaunch.bookSoon")}</Link>
                        ) : verdict.ok && offered ? (
                          <WaitlistOffer sessionId={s.id} expiresAt={wait?.expires_at ?? null} t={t} />
                        ) : verdict.ok && preview ? (
                          <span className="btn-primary gap-1.5! px-3! py-1.5! opacity-70" aria-disabled="true" title={t("preview.inert")}><Icon name="ticket" /> {t("game.book")}</span>
                        ) : verdict.ok ? (
                          <Link href={`/book/${s.id}`} className="btn-primary gap-1.5! px-3! py-1.5!"><Icon name="ticket" /> {t("game.book")}</Link>
                        ) : full && preview ? (
                          <span className="text-xs text-danger">{t("common.full")}</span>
                        ) : full ? (
                          <WaitlistControls sessionId={s.id} slug={game.slug} wait={wait} signedIn={!!viewer} t={t} />
                        ) : (
                          <span className="text-xs text-muted" title={t(verdict.reason)}>
                            {viewer?.id === game.gm_id ? t("game.yourTable") : verdict.reason === "err.removedByGm" ? t("game.seatReleased") : left <= 0 ? t("common.full") : t("game.unavailable")}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {member && game.location_type === "online" && game.table_link && (
              <div className="card p-5" data-testid="table-link">
                <h2 className="eyebrow flex items-center gap-1.5 text-accent!"><Icon name="link-alt" /> {t("game.tableLinkTitle")}</h2>
                <a href={game.table_link} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 block break-all text-sm font-semibold text-accent hover:underline">{game.table_link}</a>
                <p className="mt-1 text-xs text-muted">{t("game.tableLinkHint")}</p>
              </div>
            )}
            {member && viewer?.id !== game.gm_id && (
              <div className="card border-accent/40! p-5">
                <h2 className="eyebrow flex items-center gap-1.5 text-accent!"><Icon name="wallet" /> {t("game.howToPay")}</h2>
                <p className="mt-2 whitespace-pre-line text-sm">{game.gm_payment_info || (game.gm_has_qr ? "" : t("game.howToPayEmpty"))}</p>
                {game.gm_has_qr ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private picture behind a permission check, not for next/image
                  <img src={`/payment-qr/${game.gm_id}`} alt={t("game.qrisAlt")} className="mt-3 w-full max-w-56 rounded-md border border-border bg-white p-2" data-testid="payment-qr" />
                ) : null}
                {(game.gm_payment_info || game.gm_has_qr) ? <PaymentChangedNote gmId={game.gm_id} /> : null}
                {!preview && (game.gm_payment_info || game.gm_has_qr) ? <ReportButton targetType="user" targetId={game.gm_id} label={t("report.paymentDetails")} defaultReason="scam" className="mt-2" /> : null}
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
              {game.gm_new ? <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted"><NewGmBadge t={t} /> {t("common.newGmHint")}</p> : null}
              <p className="mt-3 line-clamp-4 text-sm text-muted">{game.gm_bio}</p>
              {viewer?.id !== game.gm_id && game.status === "published" && (preview ? (
                <span className="btn-secondary mt-4 w-full opacity-70" aria-disabled="true" title={t("preview.inert")}><Icon name="comment-dots" /> {t("ask.button")}</span>
              ) : (
                <Link href={`/games/${game.slug}/ask`} className="btn-secondary mt-4 w-full"><Icon name="comment-dots" /> {t("ask.button")}</Link>
              ))}
            </div>
          </aside>
        </div>
      </div>
      {/* Phones and tablets: the booking card sits below the whole description, so keep a way to it in reach. */}
      {sessions.length > 0 && !ownerView && (
        <>
          <div className="h-16 lg:hidden" aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-surface/95 px-4 py-2.5 shadow-[0_-4px_12px_rgb(0_0_0/0.12)] backdrop-blur lg:hidden">
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
