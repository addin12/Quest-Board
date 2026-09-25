import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/dict";
import { listMyGmRequests, listPlayerBookings, type PlayerBooking } from "@/lib/queries";
import { EmptyState, Notice, Thumb, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { ConfirmButton } from "@/components/submit-button";
import { RequestStatus } from "@/components/request-bits";
import { cancelBookingAction } from "../actions";
import { CalendarLinks } from "@/components/calendar-links";
import { googleCalendarUrl, sessionEvent } from "@/lib/calendar";
import { siteOrigin } from "@/lib/site";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.myGames") };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await requireUser("/dashboard");
  const { t } = await getI18n();
  const { booked } = await props.searchParams;
  const all = listPlayerBookings(user.id);
  const now = new Date();
  const upcoming = all.filter((b) => b.status === "confirmed" && b.session_status === "scheduled" && new Date(b.starts_at) > now);
  const past = all.filter((b) => b.status === "confirmed" && !upcoming.includes(b) && b.session_status !== "cancelled");
  const cancelled = all.filter((b) => b.status !== "confirmed" || b.session_status === "cancelled");
  const requests = listMyGmRequests(user.id);
  const origin = await siteOrigin();
  const gcal = (b: (typeof upcoming)[number]) => googleCalendarUrl(sessionEvent({ ...b, id: b.session_id }, origin, t));
  const justBooked = booked ? upcoming.find((b) => String(b.session_id) === booked) : undefined;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="calendar-clock" className="text-accent" /> {t("nav.myGames")}</h1>
      <p className="mt-1 text-muted">{t("dash.hello", { name: user.name.split(" ")[0] })}</p>
      {booked && (
        <div className="mt-6">
          <Notice tone="success">
            {t("dash.bookedBanner")}
            {justBooked && <div className="mt-2"><CalendarLinks sessionId={justBooked.session_id} google={gcal(justBooked)} t={t} /></div>}
          </Notice>
        </div>
      )}

      <Section icon="calendar" title={t("dash.upcoming", { n: upcoming.length })}>
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
      </Section>

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

      {cancelled.length > 0 && (
        <Section icon="archive" title={t("dash.cancelled")}>
          {cancelled.map((b) => (
            <BookingRow key={b.booking_id} b={b} t={t}>
              <span className="text-xs text-muted">
                {b.cancelled_by === "gm" || b.session_status === "cancelled" ? t("dash.cancelledByGm") : t("dash.cancelledByYou")}
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
      <div className="min-w-0 flex-1">
        <Link href={`/games/${b.slug}`} className="font-semibold hover:text-accent">{b.title}</Link>
        <p className="text-sm text-muted">
          <LocalTime iso={b.starts_at} /> · {b.system} · {b.location_type === "online" ? b.platform : b.city} · GM {b.gm_name} ·{" "}
          {priceLabel(b.price_idr, t)}
        </p>
        {extra && <div className="mt-1.5">{extra}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
