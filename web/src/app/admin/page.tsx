import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats } from "@/lib/moderation";
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
    </div>
  );
}
