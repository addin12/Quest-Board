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
import { AddSessionForm } from "@/components/forms";
import { ConfirmButton, SubmitButton } from "@/components/submit-button";
import { archiveGameAction, cancelSessionAction, completeSessionAction } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("gmDash.manage") };
}

export default async function ManageGamePage(props: PageProps<"/gm/games/[id]">) {
  const gm = await requireGm();
  const { t } = await getI18n();
  const { id } = await props.params;
  const game = getGameById(Number(id));
  if (!game || (game.gm_id !== gm.id && gm.role !== "admin") || game.status === "archived") notFound();
  const sessions = listSessions(game.id);
  const now = new Date();
  const upcoming = sessions.filter((s) => s.status === "scheduled" && new Date(s.starts_at) > now);
  const needsWrapUp = sessions.filter((s) => s.status === "scheduled" && new Date(s.starts_at) <= now);
  const history = sessions.filter((s) => s.status !== "scheduled").reverse();

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
          <Link href={`/gm/games/${game.id}/edit`} className="btn-secondary"><Icon name="pencil" /> {t("manage.editDetails")}</Link>
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
              <SessionCard key={s.id} s={s} seatsTotal={game.seats_total} t={t}>
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
              <SessionCard key={s.id} s={s} seatsTotal={game.seats_total} t={t}>
                <form action={cancelSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <ConfirmButton className="btn-danger py-1.5!" message={t("manage.cancelConfirm", { n: s.seats_taken })}>
                    <Icon name="cross-circle" /> {t("manage.cancelSession")}
                  </ConfirmButton>
                </form>
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
}: {
  s: { id: number; starts_at: string; duration_minutes: number; seats_taken: number };
  seatsTotal: number;
  t: T;
  children: React.ReactNode;
}) {
  const active = listSessionRoster(s.id).filter((r) => r.status === "confirmed");
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Icon name="calendar-clock" className="text-muted" /><LocalTime iso={s.starts_at} mode="long" /></p>
          <p className="text-sm text-muted">
            {t("common.hours", { n: s.duration_minutes / 60 })} · {t("manage.seatsBooked", { n: s.seats_taken, total: seatsTotal })}
          </p>
        </div>
        {children}
      </div>
      {active.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label={t("manage.roster")}>
          {active.map((p) => (
            <li key={p.booking_id} className="flex items-center gap-2 rounded-full border border-border py-1 pr-3 pl-1 text-sm">
              <Avatar name={p.name} hue={p.avatar_hue} image={p.avatar_image} size={24} /> {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
