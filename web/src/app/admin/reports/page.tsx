import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats, listReports } from "@/lib/moderation";
import { canRemove, reasonKey, targetKey } from "@/lib/reports";
import { EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import { decideReportAction } from "@/app/actions";
import { AdminNav } from "../admin-nav";
import { isScamSignal } from "@/lib/scam-signals";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.reports"), robots: { index: false } };
}

const STATUSES = ["open", "resolved", "dismissed"] as const;

export default async function AdminReportsPage(props: PageProps<"/admin/reports">) {
  await requireAdmin();
  const { t } = await getI18n();
  const sp = await props.searchParams;
  const status = STATUSES.find((s) => s === sp.status) ?? "open";
  const reports = listReports(status);
  const statusLabel = { open: t("admin.statusOpen"), resolved: t("admin.statusResolved"), dismissed: t("admin.statusDismissed") };
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("admin.reports")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("admin.reportsLead")}</p>
      <AdminNav t={t} current="reports" openReports={adminStats().openReports} />
      <nav aria-label={t("admin.filterStatus")} className="mb-5 flex gap-2 text-sm">
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/reports?status=${s}`} aria-current={s === status ? "page" : undefined} className={`chip ${s === status ? "border-accent! text-accent!" : ""}`}>
            {statusLabel[s]}
          </Link>
        ))}
      </nav>
      {reports.length === 0 ? (
        <EmptyState title={t("admin.noReports")}>{t("admin.noReportsBody")}</EmptyState>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="card p-5" aria-labelledby={`rep-${r.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={`rep-${r.id}`} className="text-base font-bold">{t(targetKey(r.target_type))} · {t(reasonKey(r.reason))}</h2>
                {r.same_target_open > 1 && <span className="chip border-danger/40! text-danger!">{t("admin.sameTarget", { n: r.same_target_open })}</span>}
                {r.owner_suspended ? <span className="chip">{t("admin.suspendedChip")}</span> : null}
                <span className="ml-auto text-xs text-muted"><LocalTime iso={r.created_at} /></span>
              </div>
              <p className="mt-1 text-xs text-muted">{t("admin.reportedBy", { reporter: r.reporter_name ?? t("admin.autoFlag"), owner: r.owner_name })}</p>
              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-3 font-sans text-sm">{r.snapshot}</pre>
              {r.reporter_name === null ? (
                <p className="mt-2 text-sm"><span className="font-semibold">{t("admin.autoFlagWhy")}</span> {r.details.split(",").filter(isScamSignal).map((s) => t(`scam.${s}`)).join(" · ")}</p>
              ) : r.details && <p className="mt-2 text-sm"><span className="font-semibold">{t("admin.reporterSays")}</span> {r.details}</p>}
              <p className="mt-2 text-sm"><Link href={r.href} className="font-semibold text-accent underline">{t("admin.openTarget")}</Link></p>
              {r.status === "open" ? (
                <form action={decideReportAction} className="mt-4 space-y-3 border-t border-border pt-4">
                  <input type="hidden" name="reportId" value={r.id} />
                  <div>
                    <label htmlFor={`note-${r.id}`} className="label">{t("admin.note")}</label>
                    <input id={`note-${r.id}`} name="note" maxLength={500} className="input" placeholder={t("admin.notePh")} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canRemove(r.target_type) && (
                      <button name="decision" value="remove" className="btn-danger"><Icon name="trash" /> {t(r.target_type === "game" ? "admin.archiveGame" : "admin.remove")}</button>
                    )}
                    {!r.owner_suspended && <button name="decision" value="suspend" className="btn-danger"><Icon name="ban" /> {t("admin.suspendOwner", { name: r.owner_name })}</button>}
                    <button name="decision" value="dismiss" className="btn-secondary"><Icon name="cross-circle" /> {t("admin.dismiss")}</button>
                  </div>
                </form>
              ) : (
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                  {t("admin.decided", { decision: t(`admin.decision.${r.decision ?? "dismiss"}` as "admin.decision.remove"), name: r.resolver_name ?? "—" })}
                  {r.note ? ` — “${r.note}”` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
