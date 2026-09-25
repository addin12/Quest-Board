import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats, listUsersForAdmin } from "@/lib/moderation";
import { ConfirmButton } from "@/components/submit-button";
import { Icon } from "@/components/icon";
import { setSuspendedAction } from "@/app/actions";
import { AdminNav } from "../admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.users"), robots: { index: false } };
}

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const { t } = await getI18n();
  const q = String((await props.searchParams).q ?? "").slice(0, 80);
  const rows = listUsersForAdmin(q);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("admin.users")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("admin.usersLead")}</p>
      <AdminNav t={t} current="users" openReports={adminStats().openReports} />
      <form className="mb-5 flex max-w-md gap-2" role="search">
        <label htmlFor="q" className="sr-only">{t("admin.search")}</label>
        <input id="q" name="q" defaultValue={q} className="input" placeholder={t("admin.searchPh")} />
        <button className="btn-secondary"><Icon name="search" /> {t("common.search")}</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">{t("admin.colName")}</th>
              <th scope="col" className="px-4 py-3 max-sm:hidden">{t("admin.colRole")}</th>
              <th scope="col" className="px-4 py-3 max-sm:hidden">{t("admin.colReports")}</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">{t("admin.colActions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link href={`/gms/${r.id}`} className="font-semibold hover:text-accent">{r.name}</Link>
                  <span className="block text-xs text-muted">{r.email}</span>
                  {r.suspended_at ? <span className="chip mt-1 sm:hidden">{t("admin.suspendedChip")}</span> : null}
                </td>
                <td className="px-4 py-3 max-sm:hidden">{t(`admin.role.${r.role}` as "admin.role.player")}{r.suspended_at ? <span className="chip ml-2">{t("admin.suspendedChip")}</span> : null}</td>
                <td className="px-4 py-3 max-sm:hidden">{r.open_reports > 0 ? <span className="font-bold text-danger">{r.open_reports}</span> : 0}</td>
                <td className="px-4 py-3 text-right">
                  {r.role !== "admin" && r.id !== admin.id && (
                    <form action={setSuspendedAction}>
                      <input type="hidden" name="userId" value={r.id} />
                      <input type="hidden" name="suspend" value={r.suspended_at ? "0" : "1"} />
                      {r.suspended_at ? (
                        <button className="btn-secondary px-3! py-1! text-xs!" aria-label={t("admin.unsuspendNamed", { name: r.name })}><Icon name="user-check" /> {t("admin.unsuspend")}</button>
                      ) : (
                        <ConfirmButton className="btn-danger px-3! py-1! text-xs!" message={t("admin.suspendConfirm", { name: r.name })} ariaLabel={t("admin.suspendNamed", { name: r.name })}>
                          <Icon name="ban" /> {t("admin.suspend")}
                        </ConfirmButton>
                      )}
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-sm text-muted">{t("admin.noMatches")}</p>}
      </div>
    </div>
  );
}
