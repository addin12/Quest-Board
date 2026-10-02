import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { getSessionWithGame, removedFromSession } from "@/lib/queries";
import { canBook } from "@/lib/policy";
import { heldSeats, myWaitlist, refreshWaitlists } from "@/lib/waitlist";
import { Cover, Notice, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { ReserveForm } from "@/components/reserve-form";
import { Icon } from "@/components/icon";
import { isPrelaunch } from "@/lib/prelaunch";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("book.title") };
}

export default async function BookPage(props: PageProps<"/book/[sessionId]">) {
  const { sessionId } = await props.params;
  const id = Number(sessionId);
  const user = await requireUser(`/book/${id}`);
  const { t } = await getI18n();
  if (Number.isInteger(id)) refreshWaitlists([id]);
  const s = Number.isInteger(id) ? getSessionWithGame(id) : undefined;
  if (!s) notFound();
  const held = heldSeats(db(), id, user.id);
  const offer = myWaitlist(user.id).find((w) => w.session_id === id && w.status === "offered");

  const already = !!db()
    .prepare("SELECT 1 FROM bookings WHERE session_id = ? AND player_id = ? AND status = 'confirmed'")
    .get(id, user.id);
  const verdict = canBook({
    sessionStatus: s.status, gameStatus: s.game_status, startsAt: new Date(s.starts_at), now: new Date(),
    seatsTotal: s.seats_total, seatsTaken: s.seats_taken + held, isGm: s.gm_id === user.id, alreadyBooked: already,
    removedByGm: removedFromSession(id, user.id),
  });
  const price = priceLabel(s.price_idr, t);

  return (
    <div className="mx-auto grid max-w-4xl gap-8 px-4 py-12 md:grid-cols-[1fr_320px]">
      <div>
        <Link href={`/games/${s.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("book.back")}</Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold"><Icon name="ticket" className="text-accent" /> {t("book.title")}</h1>
        <div className="mt-6">
          {verdict.ok && offer?.expires_at && (
            <div className="mb-4"><Notice tone="success">{t("wait.offerNotice")} <LocalTime iso={offer.expires_at} /></Notice></div>
          )}
          {isPrelaunch() ? (
            <Notice tone="info">{t("err.prelaunch")} <Link href="/opening" className="font-semibold text-accent hover:underline">{t("prelaunch.notifyLink")}</Link></Notice>
          ) : verdict.ok ? (
            <ReserveForm sessionId={s.id} priceText={price} isFree={s.price_idr === 0} startsAt={s.starts_at} price={s.price_idr} />
          ) : (
            <Notice tone="danger">{t(verdict.reason)}</Notice>
          )}
        </div>
      </div>
      <aside className="card h-fit overflow-hidden">
        <Cover hue={s.cover_hue} system={s.system} image={s.cover_image} className="h-32" />
        <div className="space-y-3 p-5 text-sm">
          <p className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{s.title}</p>
          <p className="flex items-center gap-2 text-muted"><Icon name="hat-wizard" /> {t("book.withGm", { name: s.gm_name })}</p>
          <p className="flex items-start gap-2"><Icon name="calendar-clock" className="mt-0.5 text-muted" /> <span><LocalTime iso={s.starts_at} mode="long" /> · {t("common.hours", { n: s.duration_minutes / 60 })}</span></p>
          <p className="flex items-center gap-2 text-muted"><Icon name="users" /> {t("game.seatsLeftOf", { left: Math.max(0, s.seats_total - s.seats_taken - held), total: s.seats_total })}</p>
          <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
            <span>{t("book.priceToGm")}</span>
            <span>{price}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
