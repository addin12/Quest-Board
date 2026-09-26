import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats, launchMetrics } from "@/lib/moderation";
import { countRecentErrors } from "@/lib/error-log";
import { Icon } from "@/components/icon";
import { AdminNav } from "./admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.title"), robots: { index: false } };
}

export default async function AdminHomePage() {
  await requireAdmin();
  const { t } = await getI18n();
  const s = adminStats();
  const m = launchMetrics(7);
  const errors = countRecentErrors(7);
  const pulse = [
    ["users", m.signups, t("admin.pulseSignups")],
    ["dice-d20", m.gamesPublished, t("admin.pulseGames")],
    ["ticket", m.seatsBooked, t("admin.pulseSeats")],
    ["comment-dots", m.questions, t("admin.pulseQuestions")],
    ["thumbtack", m.notices, t("admin.pulseNotices")],
    ["briefcase", m.gmRequests, t("admin.pulseRequests")],
  ] as const;
  const tiles = [
    { href: "/admin/reports", icon: "flag", n: s.openReports, label: t("admin.statOpenReports"), urgent: s.openReports > 0 },
    { href: "/admin/gms", icon: "user-check", n: s.unverifiedGms, label: t("admin.statUnverified"), urgent: false },
    { href: "/admin/users", icon: "user-slash", n: s.suspended, label: t("admin.statSuspended"), urgent: false },
    { href: "/admin/users", icon: "users-alt", n: s.members, label: t("admin.statMembers"), urgent: false },
  ] as const;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("admin.title")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("admin.lead")}</p>
      <AdminNav t={t} current="home" openReports={s.openReports} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className={`card p-5 hover:border-accent ${tile.urgent ? "border-danger/50!" : ""}`}>
            <Icon name={tile.icon} className={tile.urgent ? "text-danger" : "text-accent"} />
            <p className="mt-2 text-3xl font-bold">{tile.n}</p>
            <p className="text-sm text-muted">{tile.label}</p>
          </Link>
        ))}
      </div>

      <section className="mt-10" aria-labelledby="pulse-h">
        <h2 id="pulse-h" className="text-xl font-bold">{t("admin.pulseTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.pulseLead")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {pulse.map(([icon, n, label]) => (
            <div key={label} className="card p-4">
              <dt className="flex items-center gap-1.5 text-xs text-muted"><Icon name={icon} /> {label}</dt>
              <dd className="mt-1 text-2xl font-bold">{n}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm">
          <Link href="/admin/errors" className={`inline-flex items-center gap-1.5 hover:underline ${errors > 0 ? "font-semibold text-danger" : "text-muted"}`}>
            <Icon name="triangle-warning" /> {t("admin.pulseErrors", { n: errors })}
          </Link>
        </p>
      </section>
    </div>
  );
}
