import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/dict";
import { listMyGmRequests, listPlayerBookings, type PlayerBooking } from "@/lib/queries";
import { Avatar, EmptyState, GameCard, Notice, Thumb, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { ConfirmButton } from "@/components/submit-button";
import { RequestStatus } from "@/components/request-bits";
import { cancelBookingAction } from "../actions";
import { CalendarLinks } from "@/components/calendar-links";
import { ResendVerificationButton } from "@/components/account-forms";
import { myWaitlistDetailed, refreshWaitlists } from "@/lib/waitlist";
import { WaitlistOffer } from "@/components/waitlist-controls";
import { MonthCalendar } from "@/components/month-calendar";
import { leaveWaitlistAction } from "../actions";
import { listFollowing, listSavedGameIds, myNotices } from "@/lib/community";
import { getGameCardsByIds } from "@/lib/queries";
import { googleCalendarUrl, sessionEvent } from "@/lib/calendar";
import { siteOrigin } from "@/lib/site";
import { Icon } from "@/components/icon";
import { listPlayerQuestions } from "@/lib/questions";
import { QuestionList } from "@/components/question-list";
import type { RegularIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.myGames") };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const questions = listPlayerQuestions(user.id);
  const { t } = await getI18n();
  const { booked, reset, view } = await props.searchParams;
  const calendarView = view === "calendar";
  const all = listPlayerBookings(user.id);
  const now = new Date();
  const upcoming = all.filter((b) => b.status === "confirmed" && b.session_status === "scheduled" && new Date(b.starts_at) > now);
  const past = all.filter((b) => b.status === "confirmed" && !upcoming.includes(b) && b.session_status !== "cancelled");
  const cancelled = all.filter((b) => b.status !== "confirmed" || b.session_status === "cancelled");
  const requests = listMyGmRequests(user.id);
  refreshWaitlists(myWaitlistDetailed(user.id).map((w) => w.session_id));
  const waitlist = myWaitlistDetailed(user.id);
  const saved = getGameCardsByIds(listSavedGameIds(user.id));
  const following = listFollowing(user.id);
  const notices = myNotices(user.id).filter((n) => n.status === "open" && new Date(n.expires_at) > now);
  const origin = await siteOrigin();
  const gcal = (b: (typeof upcoming)[number]) => googleCalendarUrl(sessionEvent({ ...b, id: b.session_id }, origin, t));
  const justBooked = booked ? upcoming.find((b) => String(b.session_id) === booked) : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="calendar-clock" className="text-accent" /> {t("nav.myGames")}</h1>
      <p className="mt-1 text-muted">{t("dash.hello", { name: user.name.split(" ")[0] })}</p>
      {!user.email_verified && (
        <div className="mt-6">
          <Notice>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">{t("verify.banner", { email: user.email })} <ResendVerificationButton /></span>
          </Notice>
        </div>
      )}
      {reset && <div className="mt-6"><Notice tone="success">{t("reset.done")}</Notice></div>}
      {booked && (
        <div className="mt-6">
          <Notice tone="success">
            {t("dash.bookedBanner")}
            {justBooked && <div className="mt-2"><CalendarLinks sessionId={justBooked.session_id} google={gcal(justBooked)} t={t} /></div>}
          </Notice>
        </div>
      )}

      <nav aria-label={t("cal.viewSwitch")} className="mt-6 inline-flex rounded-md border border-border p-0.5 text-sm">
        <Link href="/dashboard" aria-current={calendarView ? undefined : "page"} className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold ${calendarView ? "text-muted hover:text-text" : "bg-accent text-accent-ink"}`}><Icon name="list-check" /> {t("cal.viewList")}</Link>
        <Link href="/dashboard?view=calendar" aria-current={calendarView ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 font-semibold ${calendarView ? "bg-accent text-accent-ink" : "text-muted hover:text-text"}`}><Icon name="calendar" /> {t("cal.viewCalendar")}</Link>
      </nav>

      {calendarView && (
        <div className="mt-6">
          <MonthCalendar
            items={[
              ...upcoming.map((b) => ({ id: `b${b.booking_id}`, title: b.title, href: `/games/${b.slug}`, startsAt: b.starts_at, kind: "booked" as const })),
              ...waitlist.map((w) => ({ id: `w${w.session_id}`, title: w.title, href: `/games/${w.slug}`, startsAt: w.starts_at, kind: w.status === "offered" ? ("offered" as const) : ("waitlist" as const) })),
            ]}
          />
        </div>
      )}

      {!calendarView && <Section icon="calendar" title={t("dash.upcoming", { n: upcoming.length })}>
        {upcoming.length === 0 ? (
          <EmptyState title={t("dash.noUpcoming")}>
            <Link href="/games" className="btn-primary mt-3"><Icon name="search" /> {t("nav.findGame")}</Link>
          </EmptyState>
        ) : (
          upcoming.map((b) => (
            <BookingRow key={b.booking_id} b={b} t={t} extra={<CalendarLinks compact sessionId={b.session_id} google={gcal(b)} t={t} />}>
              <Link href={`/games/${b.slug}`} className="btn-secondary px-3! py-1! text-xs"><Icon name="wallet" /> {t("dash.payInfo")}</Link>
              <form action={cancelBookingAction}>
                <input type="hidden" name="bookingId" value={b.booking_id} />
                <ConfirmButton className="btn-ghost px-2! py-1! text-xs" message={t("dash.cancelConfirm")}>
                  <Icon name="cross-circle" /> {t("dash.cancel")}
                </ConfirmButton>
              </form>
            </BookingRow>
          ))
        )}
      </Section>}

      {waitlist.length > 0 && (
        <Section icon="hourglass-end" title={t("wait.sectionTitle", { n: waitlist.length })}>
          {waitlist.map((w) => (
            <div key={w.session_id} className={`card flex flex-wrap items-center gap-4 p-4 ${w.status === "offered" ? "border-accent/60!" : ""}`}>
              <div className="min-w-0 flex-1">
                <Link href={`/games/${w.slug}`} className="font-semibold hover:text-accent">{w.title}</Link>
                <p className="text-sm text-muted"><LocalTime iso={w.starts_at} /> · {w.system}</p>
                <p className="mt-1 text-sm">{w.status === "offered" ? t("wait.offeredLine") : t("wait.position", { n: w.position })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {w.status === "offered" && <WaitlistOffer sessionId={w.session_id} expiresAt={w.expires_at} t={t} />}
                <form action={leaveWaitlistAction}>
                  <input type="hidden" name="sessionId" value={w.session_id} />
                  <button className="btn-ghost px-2! py-1! text-xs">{t(w.status === "offered" ? "wait.decline" : "wait.leave")}</button>
                </form>
              </div>
            </div>
          ))}
        </Section>
      )}

      {saved.length > 0 && (
        <Section icon="bookmark" title={t("social.savedTitle", { n: saved.length })}>
          <div className="grid gap-5 sm:grid-cols-2">{saved.map((g) => <GameCard key={g.id} game={g} t={t} />)}</div>
        </Section>
      )}

      {following.length > 0 && (
        <Section icon="heart" title={t("social.followingTitle", { n: following.length })}>
          <div className="flex flex-wrap gap-2">
            {following.map((g) => (
              <Link key={g.id} href={`/gms/${g.id}`} className="card flex items-center gap-2 py-2 pr-4 pl-2 hover:border-accent">
                <Avatar name={g.name} hue={g.avatar_hue} image={g.avatar_image} size={32} />
                <span className="text-sm"><span className="block font-semibold">{g.name}</span><span className="block text-xs text-muted">{g.headline}</span></span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {notices.length > 0 && (
        <Section icon="thumbtack" title={t("board.myNotices", { n: notices.length })}>
          {notices.map((n) => (
            <Link key={n.id} href={`/board/${n.id}`} className="card flex items-center justify-between gap-3 p-4 hover:border-accent">
              <span className="font-semibold">{n.title}</span>
              <span className="text-xs text-muted">{t("board.replies", { n: n.reply_count })}</span>
            </Link>
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section icon="dragon" title={t("dash.played")}>
          {past.map((b) => (
            <BookingRow key={b.booking_id} b={b} t={t}>
              {b.has_review ? (
                <span className="inline-flex items-center gap-1 text-xs text-success"><Icon name="check-circle" /> {t("dash.reviewed")}</span>
              ) : (
                <Link href={`/games/${b.slug}#reviews-h`} className="btn-secondary px-3! py-1! text-xs"><Icon name="star" /> {t("dash.leaveReview")}</Link>
              )}
            </BookingRow>
          ))}
        </Section>
      )}

      {all.length === 0 && (
        <section className="card mt-6 p-5" aria-labelledby="welcome-h">
          <h2 id="welcome-h" className="text-lg font-bold">{t("welcome.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("welcome.lead")}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {([
              ["/quiz", "sparkles", t("welcome.quiz")],
              ["/games?level=beginner", "seedling", t("welcome.beginner")],
              ["/board", "thumbtack", t("welcome.board")],
              ["/hire-a-gm", "briefcase", t("welcome.hire")],
            ] as const).map(([href, icon, label]) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-semibold hover:border-accent hover:text-accent">
                  <Icon name={icon} className="text-accent" /> {label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions.length > 0 && (
        <Section icon="comment-dots" title={t("dash.questions")}>
          <QuestionList rows={questions} awaitingLabel={t("dash.questionReplied")} />
        </Section>
      )}

      {cancelled.length > 0 && (
        <Section icon="archive" title={t("dash.cancelled")}>
          {cancelled.map((b) => (
            <BookingRow key={b.booking_id} b={b} t={t}>
              <span className="text-xs text-muted">
                {b.cancelled_by === "gm" || b.session_status === "cancelled" ? t("dash.cancelledByGm") : t("dash.cancelledByYou")}
                {b.session_status === "cancelled" && b.cancel_reason && <span className="mt-0.5 block italic">“{b.cancel_reason}”</span>}
              </span>
            </BookingRow>
          ))}
        </Section>
      )}

      <Section icon="briefcase" title={t("dash.myRequests", { n: requests.length })}>
        {requests.length === 0 ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span className="text-muted">{t("dash.noRequests")}</span>
            <Link href="/hire-a-gm" className="btn-secondary px-3! py-1.5!"><Icon name="briefcase" /> {t("nav.hireGm")}</Link>
          </div>
        ) : (
          requests.map((r) => (
            <Link key={r.id} href={`/hire-a-gm/requests/${r.id}`} className="card flex flex-wrap items-center gap-3 p-4 hover:border-accent">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name="clipboard-list" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-sm text-muted">{r.system || t("hire.anySystem")} · {t("hire.players", { n: r.group_size })} · {t("hire.offers", { n: r.offer_count })}</span>
              </span>
              <RequestStatus status={r.status} t={t} />
            </Link>
          ))
        )}
      </Section>

      <p className="mt-10 text-sm text-muted">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-accent hover:underline"><Icon name="settings" /> {t("settings.linkFromDash")}</Link>
      </p>
    </div>
  );
}

function Section({ icon, title, children }: { icon: RegularIcon; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name={icon} className="text-muted" /> {title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function BookingRow({ b, t, children, extra }: { b: PlayerBooking; t: T; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <Thumb hue={b.cover_hue} image={b.cover_image} />
      <div className="min-w-0 flex-1 basis-56">
        <Link href={`/games/${b.slug}`} className="font-semibold hover:text-accent">{b.title}</Link>
        <p className="text-sm text-muted">
          <LocalTime iso={b.starts_at} /> · {b.system} · {b.location_type === "online" ? b.platform : b.city} · GM {b.gm_name} ·{" "}
          {priceLabel(b.price_idr, t)}
        </p>
        {b.paid_marked_at && b.status === "confirmed" && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-success"><Icon name="check-circle" solid /> {t("paid.confirmedForYou")}</p>
        )}
        {extra && <div className="mt-1.5">{extra}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
