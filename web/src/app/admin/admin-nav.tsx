import Link from "next/link";
import type { T } from "@/lib/i18n/dict";
import { Icon } from "@/components/icon";

/** Tabs shared by the admin pages (each page renders it and does its own requireAdmin()). */
export function AdminNav({ t, current, openReports }: { t: T; current: "home" | "reports" | "gms" | "users" | "errors" | "feedback" | "setup"; openReports: number }) {
  const tabs = [
    { key: "home", href: "/admin", icon: "chart-histogram", label: t("admin.overview") },
    { key: "reports", href: "/admin/reports", icon: "flag", label: t("admin.reports"), badge: openReports },
    { key: "gms", href: "/admin/gms", icon: "user-check", label: t("admin.gms") },
    { key: "users", href: "/admin/users", icon: "users-alt", label: t("admin.users") },
    { key: "feedback", href: "/admin/feedback", icon: "comment", label: t("admin.feedback") },
    { key: "errors", href: "/admin/errors", icon: "triangle-warning", label: t("admin.errors") },
    { key: "setup", href: "/admin/setup", icon: "gears", label: t("setup.tab") },
  ] as const;
  return (
    <div className="mb-8">
      <p className="eyebrow flex items-center gap-1.5 text-accent!"><Icon name="shield" /> {t("admin.eyebrow")}</p>
      <nav aria-label={t("admin.nav")} className="mt-3 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={current === tab.key ? "page" : undefined}
            className={current === tab.key ? "btn-primary px-3! py-1.5!" : "btn-secondary px-3! py-1.5!"}
          >
            <Icon name={tab.icon} /> {tab.label}
            {"badge" in tab && tab.badge > 0 ? (
              <span className={`badge ring-0! ${current === tab.key ? "bg-accent-ink! text-accent!" : ""}`}>{tab.badge}</span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
