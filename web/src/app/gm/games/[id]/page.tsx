import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/dict";
import { getGameById, listSessionRoster, listSessions, upcomingSeatsTaken } from "@/lib/queries";
import { Avatar, Notice, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import { AddSessionForm, RescheduleSessionForm } from "@/components/forms";
import { ConfirmButton, SubmitButton, ToggleSubmit } from "@/components/submit-button";
import { archiveGameAction, cancelSessionAction, completeSessionAction, duplicateGameAction, markPaidAction, removePlayerAction } from "@/app/actions";
import { waitingCounts } from "@/lib/waitlist";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("gmDash.manage") };
}

export default async function ManageGamePage(props: PageProps<"/gm/games/[id]">) {
  const gm = await requireGm();
  const { t } = await getI18n();
  const { id } = await props.params;
  const game = getGameById(Number(id));
  if (!game || (game.gm_id !== gm.id && !gm.admin) || game.status === "archived") notFound();
  const sessions = listSessions(game.id);
  const now = new Date();
  const upcoming = sessions.filter((s) => s.status === "scheduled" && new Date(s.starts_at) > now);
  const needsWrapUp = sessions.filter((s) => s.status === "scheduled" && new Date(s.starts_at) <= now);
  const history = sessions.filter((s) => s.status !== "scheduled").reverse();
  const waiting = waitingCounts(game.id);
  const paidOn = game.price_idr > 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/gm" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("nav.gmDashboard")}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{game.title}</h1>
          <p className="text-muted">
            {game.system} · {t("manage.pricePerSeat", { price: priceLabel(game.price_idr, t) })} · {t("manage.youKeepAll")} ·{" "}
            {t("game.seatsPerSession", { n: game.seats_total })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/games/${game.slug}`} className="btn-secondary"><Icon name="eye" /> {t("manage.viewListing")}</Link>
          {game.gm_id === gm.id && <Link href={`/games/${game.slug}?preview=player`} className="btn-ghost"><Icon name="user" /> {t("preview.open")}</Link>}
          <Link href={`/gm/games/${game.id}/edit`} className="btn-secondary"><Icon name="pencil" /> {t("manage.editDetails")}</Link>
          <a href={`/api/gm/games/${game.id}/roster`} className="btn-secondary" download><Icon name="file-download" /> {t("manage.rosterCsv")}</a>
        </div>
      </div>
      {game.status === "draft" && <div className="mt-4"><Notice>{t("manage.draftNotice")}</Notice></div>}

      <section className="card mt-8 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><Icon name="calendar-plus" className="text-accent" /> {t("manage.schedule")}</h2>
        <AddSessionForm gameId={game.id} />
      </section>

      {needsWrapUp.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="hourglass-end" className="text-accent" /> {t("manage.wrapUp")}</h2>
          <div className="space-y-3">
            {needsWrapUp.map((s) => (
              <SessionCard key={s.id} s={s} seatsTotal={game.seats_total} t={t} paid={paidOn}>
                <form action={completeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <SubmitButton className="btn-primary py-1.5!"><Icon name="check" /> {t("manage.markPlayed")}</SubmitButton>
                </form>
              </SessionCard>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="calendar" className="text-muted" /> {t("manage.upcoming", { n: upcoming.length })}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">{t("manage.noUpcoming")}</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((s) => (
              <SessionCard key={s.id} s={s} seatsTotal={game.seats_total} t={t} paid={paidOn} waiting={waiting.get(s.id) ?? 0} removable>
                <details className="group w-full sm:w-auto">
                  <summary className="btn-secondary cursor-pointer list-none py-1.5! [&::-webkit-details-marker]:hidden"><Icon name="calendar-clock" /> {t("manage.moveSession")}</summary>
                  <RescheduleSessionForm sessionId={s.id} startsAt={s.starts_at} duration={s.duration_minutes} booked={s.seats_taken} />
                </details>
                <details className="group w-full sm:w-auto">
                  <summary className="btn-danger cursor-pointer list-none py-1.5! [&::-webkit-details-marker]:hidden"><Icon name="cross-circle" /> {t("manage.cancelSession")}</summary>
                  <form action={cancelSessionAction} className="mt-2 space-y-2 sm:w-80">
                    <input type="hidden" name="sessionId" value={s.id} />
                    <label htmlFor={`reason-${s.id}`} className="label">{t("manage.cancelReason")}</label>
                    <textarea id={`reason-${s.id}`} name="reason" rows={2} maxLength={300} className="input" placeholder={t("manage.cancelReasonPh")} />
                    <p className="text-xs text-muted">{t("manage.cancelReasonHint")}</p>
                    <ConfirmButton className="btn-danger py-1.5!" message={t("manage.cancelConfirm", { n: s.seats_taken })}>
                      <Icon name="cross-circle" /> {t("manage.cancelConfirmButton")}
                    </ConfirmButton>
                  </form>
                </details>
              </SessionCard>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="archive" className="text-muted" /> {t("manage.history")}</h2>
          <div className="space-y-3">
            {history.map((s) => (
              <SessionCard key={s.id} s={s} seatsTotal={game.seats_total} t={t}>
                <span className={`chip ${s.status === "cancelled" ? "text-danger!" : "text-success!"}`}>
                  {t(s.status === "cancelled" ? "status.cancelled" : "status.completed")}
                </span>
              </SessionCard>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12 border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="plus" className="text-muted" /> {t("manage.duplicateTitle")}</h2>
        <p className="mb-3 text-sm text-muted">{t("manage.duplicateBody")}</p>
        <form action={duplicateGameAction}>
          <input type="hidden" name="gameId" value={game.id} />
          <SubmitButton className="btn-secondary"><Icon name="plus" /> {t("manage.duplicate")}</SubmitButton>
        </form>
      </section>

      <section className="mt-12 border-t border-border pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-danger"><Icon name="triangle-warning" /> {t("manage.danger")}</h2>
        <p className="mb-3 text-sm text-muted">{t("manage.archiveBody")}</p>
        <form action={archiveGameAction}>
          <input type="hidden" name="gameId" value={game.id} />
          <ConfirmButton message={t("manage.archiveConfirm", { n: upcomingSeatsTaken(game.id) })}><Icon name="archive" /> {t("manage.archive")}</ConfirmButton>
        </form>
      </section>
    </div>
  );
}

function SessionCard({
  s,
  seatsTotal,
  t,
  children,
  paid = false,
  waiting = 0,
  removable = false,
}: {
  s: { id: number; starts_at: string; duration_minutes: number; seats_taken: number };
  seatsTotal: number;
  t: T;
  children: React.ReactNode;
  paid?: boolean;
  waiting?: number;
  removable?: boolean; // upcoming sessions: the GM can release one player's seat
}) {
  const active = listSessionRoster(s.id).filter((r) => r.status === "confirmed");
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Icon name="calendar-clock" className="text-muted" /><LocalTime iso={s.starts_at} mode="long" /></p>
          <p className="text-sm text-muted">
            {t("common.hours", { n: s.duration_minutes / 60 })} · {t("manage.seatsBooked", { n: s.seats_taken, total: seatsTotal })}
            {waiting > 0 && <> · <span className="font-semibold text-accent">{t("wait.gmCount", { n: waiting })}</span></>}
            {paid && active.length > 0 && <> · {t("paid.count", { n: active.filter((p) => p.paid_marked_at).length, total: active.length })}</>}
          </p>
        </div>
        {children}
      </div>
      {active.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("manage.roster")}>
          {active.map((p) => (
            <li key={p.booking_id} className={`flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-1 text-sm ${paid && p.paid_marked_at ? "border-success/40 bg-success-soft" : "border-border"}`}>
              <Avatar name={p.name} hue={p.avatar_hue} image={p.avatar_image} size={24} /> {p.name}
              {paid && p.player_paid_at && !p.paid_marked_at && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent" data-testid="says-paid"><Icon name="wallet" /> {t("paid.saysPaid")}</span>
              )}
              {paid ? (
                <form action={markPaidAction}>
                  <input type="hidden" name="bookingId" value={p.booking_id} />
                  <input type="hidden" name="paid" value={p.paid_marked_at ? "0" : "1"} />
                  <ToggleSubmit
                    field="paid" pressed={!!p.paid_marked_at}
                    onClass="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-xs font-bold text-success hover:underline"
                    offClass="inline-flex min-h-11 items-center rounded-full bg-surface-2 px-3 text-xs font-bold text-muted hover:text-text"
                    // The name starts with the visible words, so voice control ("click Mark paid") works.
                    on={<><Icon name="check" /> {t("paid.paid")}<span className="sr-only"> {t("paid.forName", { name: p.name })}</span></>}
                    off={<>{t("paid.mark")}<span className="sr-only"> {t("paid.forName", { name: p.name })}</span></>}
                  />
                </form>
              ) : <span className="pr-1.5" />}
            </li>
          ))}
        </ul>
      )}
      {removable && active.length > 0 && (
        <details className="mt-3">
          <summary className="btn-ghost inline-flex cursor-pointer list-none px-2! py-1! text-xs [&::-webkit-details-marker]:hidden"><Icon name="user-slash" /> {t("manage.removePlayer")}</summary>
          <form action={removePlayerAction} className="mt-2 space-y-2 sm:w-80">
            <label htmlFor={`remove-${s.id}`} className="label">{t("manage.removeWho")}</label>
            <select id={`remove-${s.id}`} name="bookingId" required className="input">
              {active.map((p) => <option key={p.booking_id} value={p.booking_id}>{p.name}</option>)}
            </select>
            <label htmlFor={`remove-reason-${s.id}`} className="label">{t("manage.removeReason")}</label>
            <textarea id={`remove-reason-${s.id}`} name="reason" rows={2} maxLength={300} className="input" />
            <p className="text-xs text-muted">{t("manage.removeHint")}</p>
            <ConfirmButton className="btn-danger py-1.5!" message={t("manage.removeConfirm")}><Icon name="user-slash" /> {t("manage.removeButton")}</ConfirmButton>
          </form>
        </details>
      )}
    </div>
  );
}
