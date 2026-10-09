import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n/dict";
import { adminStats } from "@/lib/moderation";
import { listErrorGroups } from "@/lib/error-log";
import { EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { AdminNav } from "../admin-nav";
import { vitalsSummary } from "@/lib/vitals-store";
import { vitalRating, type VitalMetric } from "@/lib/vitals";
import { recentSecurityEvents } from "@/lib/security-log";

const SHOWN: VitalMetric[] = ["LCP", "INP", "CLS"];
const RATING_CLASS = { good: "text-success", "needs-improvement": "text-gold", poor: "text-danger font-semibold" } as const;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.errors"), robots: { index: false } };
}

export default async function AdminErrorsPage() {
  await requireAdmin();
  const { t } = await getI18n();
  const groups = listErrorGroups();
  const vitals = vitalsSummary(7);
  const events = recentSecurityEvents(50);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("admin.errors")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("admin.errorsLead")}</p>
      <AdminNav t={t} current="errors" openReports={adminStats().openReports} />
      {groups.length === 0 ? (
        <EmptyState title={t("admin.errorsEmpty")} />
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li key={`${g.message}|${g.route_path}`} className="card p-4">
              <p className="font-mono text-sm break-words">{g.message}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{t("admin.errorsCount", { n: g.count })}</span>
                <span>{t("admin.errorsLast")} <LocalTime iso={g.last_at} /></span>
                <span className="font-mono">{g.last_path || g.route_path}</span>
                {g.digest && <span className="font-mono">{`digest ${g.digest}`}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10" aria-labelledby="vitals-title" data-testid="admin-vitals">
        <h2 id="vitals-title" className="text-2xl font-bold">{t("admin.vitalsTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("admin.vitalsLead")}</p>
        {vitals.length === 0 ? (
          <EmptyState title={t("admin.vitalsEmpty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr><th className="py-2 pr-4">{t("admin.vitalsPage")}</th>{SHOWN.map((m) => <th key={m} className="py-2 pr-4">{m}</th>)}<th className="py-2">{t("admin.vitalsSamples")}</th></tr>
              </thead>
              <tbody>
                {vitals.map((r) => (
                  <tr key={r.page} className="border-t border-border">
                    <td className="py-2 pr-4 font-mono">{r.page}</td>
                    {SHOWN.map((m) => (
                      <td key={m} className={`py-2 pr-4 ${r[m] === undefined ? "text-muted" : RATING_CLASS[vitalRating(m, r[m]!)]}`}>{r[m] === undefined ? "–" : m === "CLS" ? r[m]!.toFixed(2) : m === "INP" ? `${Math.round(r[m]!)} ms` : `${(r[m]! / 1000).toFixed(1)} s`}</td>
                    ))}
                    <td className="py-2">{r.samples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="security-title" data-testid="admin-security-log">
        <h2 id="security-title" className="text-2xl font-bold">{t("admin.securityTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("admin.securityLead")}</p>
        {events.length === 0 ? (
          <EmptyState title={t("admin.securityEmpty")} />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className="font-semibold">{t(`security.kind.${e.kind}` as MsgKey)}</span>
                <span className="text-muted">{e.name ?? t("admin.securityNoAccount")}</span>
                {e.detail && <span className="text-muted">· {e.detail}</span>}
                <span className="ml-auto text-xs text-muted"><LocalTime iso={e.created_at} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
