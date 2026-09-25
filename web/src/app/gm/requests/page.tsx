import type { Metadata } from "next";
import Link from "next/link";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/dict";
import { listMatchedRequestsForGm, listOpenRequestsForGm, type GmRequestRow } from "@/lib/queries";
import { Avatar, EmptyState, priceLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { RequestStatus } from "@/components/request-bits";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("gmRequests.title") };
}

/** GM inbox: open requests they can answer (direct ones first) and requests they were chosen for. */
export default async function GmRequestsPage() {
  const gm = await requireGm();
  const { t } = await getI18n();
  const open = listOpenRequestsForGm(gm.id);
  const matched = listMatchedRequestsForGm(gm.id);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/gm" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("nav.gmDashboard")}</Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold"><Icon name="inbox" className="text-accent" /> {t("gmRequests.title")}</h1>
      <p className="mt-1 text-muted">{t("gmRequests.lead")}</p>

      {matched.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="handshake" className="text-success" /> {t("gmRequests.matched", { n: matched.length })}</h2>
          <div className="space-y-3">{matched.map((r) => <RequestRow key={r.id} r={r} t={t} />)}</div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><Icon name="clipboard-list" className="text-muted" /> {t("gmRequests.open", { n: open.length })}</h2>
        {open.length === 0 ? (
          <EmptyState title={t("gmRequests.emptyTitle")}>{t("gmRequests.emptyBody")}</EmptyState>
        ) : (
          <div className="space-y-3">
            {open.map((r) => (
              <RequestRow key={r.id} r={r} t={t} badge={r.gm_id ? t("gmRequests.direct") : undefined} done={!!r.my_offer} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestRow({ r, t, badge, done }: { r: GmRequestRow; t: T; badge?: string; done?: boolean }) {
  return (
    <Link href={`/hire-a-gm/requests/${r.id}`} className="card flex flex-wrap items-start gap-4 p-4 hover:border-accent">
      <Avatar name={r.requester_name} hue={r.requester_hue} image={r.requester_image} size={40} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {r.title}
          {badge && <span className="chip gap-1 border-accent/30! bg-accent-soft! text-accent!"><Icon name="hat-wizard" /> {badge}</span>}
          {done && <span className="chip gap-1 border-success/30! bg-success-soft! text-success!"><Icon name="check" /> {t("gmRequests.offered")}</span>}
        </p>
        <p className="text-sm text-muted">
          {r.system || t("hire.anySystem")} · {t("hire.players", { n: r.group_size })} · {r.location_type === "online" ? t("loc.online") : r.city}
          {r.budget_idr ? ` · ${t("hire.budgetValue", { price: priceLabel(r.budget_idr, t) })}` : ""}
        </p>
        <p className="mt-1 line-clamp-2 text-sm">{r.details}</p>
        <p className="mt-1 text-xs text-muted">{r.requester_name} · <LocalTime iso={r.created_at} /> · {t("hire.offers", { n: r.offer_count })}</p>
      </div>
      <RequestStatus status={r.status} t={t} />
    </Link>
  );
}
