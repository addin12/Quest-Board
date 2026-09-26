import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats } from "@/lib/moderation";
import { listErrorGroups } from "@/lib/error-log";
import { EmptyState } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { AdminNav } from "../admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.errors"), robots: { index: false } };
}

export default async function AdminErrorsPage() {
  await requireAdmin();
  const { t } = await getI18n();
  const groups = listErrorGroups();
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
    </div>
  );
}
