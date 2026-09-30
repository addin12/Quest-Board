import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats } from "@/lib/moderation";
import { currentSetupChecks } from "@/lib/setup-facts";
import type { CheckLevel } from "@/lib/setup-check";
import { Icon } from "@/components/icon";
import { AdminNav } from "../admin-nav";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("setup.title"), robots: { index: false } };
}

const LOOK: Record<CheckLevel, { icon: "check-circle" | "triangle-warning" | "cross-circle"; className: string }> = {
  ok: { icon: "check-circle", className: "text-success" },
  warn: { icon: "triangle-warning", className: "text-accent" },
  danger: { icon: "cross-circle", className: "text-danger" },
};

/** Is this server set up safely? (lib/setup-check.ts) */
export default async function AdminSetupPage() {
  await requireAdmin();
  const { t } = await getI18n();
  const checks = currentSetupChecks();
  const order: CheckLevel[] = ["danger", "warn", "ok"];
  const sorted = [...checks].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("setup.title")}</h1>
      <p className="mt-1 mb-6 max-w-prose text-muted">{t("setup.lead")}</p>
      <AdminNav t={t} current="setup" openReports={adminStats().openReports} />
      <ul className="card divide-y divide-border">
        {sorted.map((c) => (
          <li key={c.id} className="flex items-start gap-3 p-4" data-testid="setup-check" data-level={c.level}>
            <Icon name={LOOK[c.level].icon} className={`mt-1 shrink-0 ${LOOK[c.level].className}`} />
            <div className="min-w-0">
              <p className="font-semibold">
                {t(c.title)} <span className={`ml-1 text-xs font-bold uppercase tracking-wide ${LOOK[c.level].className}`}>{t(`setup.level.${c.level}`)}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted break-words">{t(c.detail, c.vars)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
