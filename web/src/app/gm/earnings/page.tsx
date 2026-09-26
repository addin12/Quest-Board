import type { Metadata } from "next";
import Link from "next/link";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { gmEarningRows } from "@/lib/queries";
import { summarizeEarnings } from "@/lib/earnings";
import { formatIdr } from "@/lib/policy";
import { EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("earnings.title") };
}

export default async function EarningsPage() {
  const gm = await requireGm();
  const { t, lang } = await getI18n();
  const rows = gmEarningRows(gm.id);
  const e = summarizeEarnings(rows);
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString(lang === "id" ? "id-ID" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/gm" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("nav.gmDashboard")}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="coins" className="text-accent" /> {t("earnings.title")}</h1>
        {rows.length > 0 && <a href="/api/gm/earnings" className="btn-secondary" download><Icon name="download" /> {t("earnings.download")}</a>}
      </div>
      <p className="mt-1 max-w-3xl text-muted">{t("earnings.lead")}</p>

      {rows.length === 0 ? (
        <div className="mt-8"><EmptyState title={t("earnings.empty")} /></div>
      ) : (
        <>
          <dl className="mt-8 grid gap-3 sm:grid-cols-3">
            <Tile icon="calendar" label={t("earnings.thisMonth")} value={formatIdr(e.thisMonth.paid)} sub={t("earnings.paidOf", { expected: formatIdr(e.thisMonth.expected) })} />
            <Tile icon="hourglass-end" label={t("earnings.upcoming")} value={formatIdr(e.upcoming.expected)} sub={t("earnings.upcomingSub", { seats: e.upcoming.seats, sessions: e.upcoming.sessions })} />
            <Tile icon="triangle-warning" label={t("earnings.outstanding")} value={formatIdr(e.outstanding)} sub={t("earnings.outstandingSub", { n: e.unpaid.length })} />
          </dl>

          <section className="mt-10" aria-labelledby="unpaid-h">
            <h2 id="unpaid-h" className="text-xl font-bold">{t("earnings.toChase")}</h2>
            <p className="mt-1 text-sm text-muted">{t("earnings.toChaseLead")}</p>
            {e.unpaid.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-success"><Icon name="check-circle" /> {t("earnings.none")}</p>
            ) : (
              <ul className="card mt-3 divide-y divide-border">
                {e.unpaid.map((r) => (
                  <li key={r.booking_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-sm">
                    <span className="min-w-40 font-semibold">{shownName(r.player_name, t)}</span>
                    <span className="flex-1 text-muted">{r.title} · <LocalTime iso={r.starts_at} /></span>
                    <span className="font-semibold">{formatIdr(r.price_idr)}</span>
                    <Link href={`/gm/games/${r.game_id}`} className="text-accent hover:underline">{t("earnings.openRoster")}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {e.months.length > 0 && (
            <section className="mt-10" aria-labelledby="months-h">
              <h2 id="months-h" className="text-xl font-bold">{t("earnings.byMonth")}</h2>
              <div className="card mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-3">{t("earnings.colMonth")}</th>
                      <th scope="col" className="px-4 py-3 text-right">{t("earnings.colSessions")}</th>
                      <th scope="col" className="px-4 py-3 text-right">{t("earnings.colSeats")}</th>
                      <th scope="col" className="px-4 py-3 text-right">{t("earnings.colExpected")}</th>
                      <th scope="col" className="px-4 py-3 text-right">{t("earnings.colPaid")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {e.months.slice(0, 12).map((m) => (
                      <tr key={m.month}>
                        <th scope="row" className="px-4 py-3 font-semibold">{monthName(m.month)}</th>
                        <td className="px-4 py-3 text-right">{m.sessions}</td>
                        <td className="px-4 py-3 text-right">{m.seats}</td>
                        <td className="px-4 py-3 text-right">{formatIdr(m.expected)}</td>
                        <td className="px-4 py-3 text-right">{formatIdr(m.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: RegularIcon; label: string; value: string; sub: string }) {
  return (
    <div className="card p-4">
      <dt className="flex items-center gap-1.5 text-sm text-muted"><Icon name={icon} /> {label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
      <dd className="text-xs text-muted">{sub}</dd>
    </div>
  );
}
