import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats, listGmsForAdmin } from "@/lib/moderation";
import { VerifiedBadge } from "@/components/ui";
import { Icon } from "@/components/icon";
import { revokeGmInviteAction, setGmVerifiedAction } from "@/app/actions";
import { listGmInvites } from "@/lib/gm-invites";
import { GmInviteForm } from "@/components/gm-invite-form";
import { LocalTime } from "@/components/local-time";
import { AdminNav } from "../admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.gms"), robots: { index: false } };
}

export default async function AdminGmsPage(props: PageProps<"/admin/gms">) {
  await requireAdmin();
  const { t } = await getI18n();
  const q = String((await props.searchParams).q ?? "").slice(0, 80);
  const rows = listGmsForAdmin(q);
  const invites = listGmInvites();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("admin.gms")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("admin.gmsLead")}</p>
      <AdminNav t={t} current="gms" openReports={adminStats().openReports} />
      <section className="card mb-8 p-5" aria-labelledby="invites-h">
        <h2 id="invites-h" className="flex items-center gap-2 text-lg font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("admin.invites")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("admin.invitesLead")}</p>
        <GmInviteForm />
        {invites.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("admin.invitesEmpty")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border text-sm" data-testid="invites">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-semibold">{i.note || "—"}</span>
                <span className="text-muted">
                  {i.status === "used" ? t("admin.inviteUsed", { name: i.used_by_name ?? "?" }) : i.status === "expired" ? t("admin.inviteExpired") : <>{t("admin.inviteOpenUntil")} <LocalTime iso={i.expires_at} mode="date" /></>}
                </span>
                {i.status === "open" && (
                  <form action={revokeGmInviteAction} className="ml-auto">
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-xs font-semibold text-danger hover:underline">{t("admin.inviteRevoke")}</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
              <th scope="col" className="px-4 py-3 max-sm:hidden">{t("admin.colGames")}</th>
              <th scope="col" className="px-4 py-3 max-sm:hidden">{t("admin.colReports")}</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">{t("admin.colActions")}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <Link href={`/gms/${r.id}`} className="font-semibold hover:text-accent">{r.name}</Link> {r.verified ? <VerifiedBadge label={t("common.verifiedGm")} /> : null}
                  <span className="block text-xs text-muted">{r.email} · {r.headline}</span>
                  {/* Changing payment details often is a scam pattern (or a hijacked account). */}
                  {r.payment_changes >= 2 && (
                    <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger"><Icon name="triangle-warning" /> {t("admin.paymentChanges", { n: r.payment_changes })}</span>
                  )}
                </td>
                <td className="px-4 py-3 max-sm:hidden">{r.games}</td>
                <td className="px-4 py-3 max-sm:hidden">{r.open_reports > 0 ? <span className="font-bold text-danger">{r.open_reports}</span> : 0}</td>
                <td className="px-4 py-3 text-right">
                  <form action={setGmVerifiedAction}>
                    <input type="hidden" name="userId" value={r.id} />
                    <input type="hidden" name="verified" value={r.verified ? "0" : "1"} />
                    <button className={r.verified ? "btn-ghost px-3! py-1! text-xs!" : "btn-primary px-3! py-1! text-xs!"} aria-label={t(r.verified ? "admin.unverifyNamed" : "admin.verifyNamed", { name: r.name })}>
                      <Icon name={r.verified ? "cross-circle" : "badge-check"} /> {t(r.verified ? "admin.unverify" : "admin.verify")}
                    </button>
                  </form>
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
