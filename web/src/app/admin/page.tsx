import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { adminStats, launchMetrics, listAdminLog, verifiedGmCount } from "@/lib/moderation";
import { LocalTime } from "@/components/local-time";
import { shownName } from "@/lib/i18n/dict";
import { countRecentErrors } from "@/lib/error-log";
import { Icon } from "@/components/icon";
import type { RegularIcon } from "@/lib/icons";
import { AdminNav } from "./admin-nav";
import { currentSetupChecks } from "@/lib/setup-facts";
import { isPrelaunch, launchNotifyCount } from "@/lib/prelaunch";
import { setPrelaunchAction } from "@/app/actions";
import { ConfirmButton, SubmitButton } from "@/components/submit-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("admin.title"), robots: { index: false } };
}

export default async function AdminHomePage() {
  await requireAdmin();
  const { t } = await getI18n();
  const s = adminStats();
  const periods = [launchMetrics(7), launchMetrics(30), launchMetrics(null)] as const;
  const verified = verifiedGmCount();
  const prelaunch = isPrelaunch();
  const waiting = launchNotifyCount();
  const errors = countRecentErrors(7);
  const setupProblems = currentSetupChecks().filter((c) => c.level === "danger").length;
  const log = listAdminLog(15);
  type Metrics = (typeof periods)[number];
  const pulse: [RegularIcon, (m: Metrics) => number, string][] = [
    ["users", (m) => m.signups, t("admin.pulseSignups")],
    ["hat-wizard", (m) => m.newGms, t("admin.pulseNewGms")],
    ["dice-d20", (m) => m.gamesPublished, t("admin.pulseGames")],
    ["ticket", (m) => m.seatsBooked, t("admin.pulseSeats")],
    ["calendar-clock", (m) => m.sessionsPlayed, t("admin.pulseSessions")],
    ["comment-dots", (m) => m.questions, t("admin.pulseQuestions")],
    ["thumbtack", (m) => m.notices, t("admin.pulseNotices")],
    ["briefcase", (m) => m.gmRequests, t("admin.pulseRequests")],
  ];
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
      {setupProblems > 0 && (
        <p className="card mb-6 flex flex-wrap items-center gap-2 border-danger/50! p-4 text-sm" role="note">
          <Icon name="cross-circle" className="text-danger" /> {t("setup.bannerDanger", { n: setupProblems })}{" "}
          <Link href="/admin/setup" className="font-semibold text-accent hover:underline">{t("setup.bannerLink")}</Link>
        </p>
      )}
      <section className="card mb-6 flex flex-wrap items-center gap-3 p-4" aria-labelledby="prelaunch-h" data-testid="prelaunch-card">
        <div className="min-w-0 flex-1">
          <h2 id="prelaunch-h" className="flex items-center gap-2 font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("admin.prelaunchTitle")}</h2>
          <p className="text-sm text-muted">{prelaunch ? t("admin.prelaunchOnText", { n: waiting }) : t("admin.prelaunchOffText")}</p>
        </div>
        <form action={setPrelaunchAction}>
          <input type="hidden" name="on" value={prelaunch ? "0" : "1"} />
          {prelaunch
            ? <ConfirmButton className="btn-primary" message={t("admin.prelaunchOpenConfirm", { n: waiting })}>{t("admin.prelaunchOpen")}</ConfirmButton>
            : <SubmitButton className="btn-secondary">{t("admin.prelaunchTurnOn")}</SubmitButton>}
        </form>
      </section>
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
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full text-sm" data-testid="launch-pulse">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="p-3 font-semibold"><span className="sr-only">{t("admin.pulseWhat")}</span></th>
                <th scope="col" className="p-3 text-right font-semibold">{t("admin.pulse7")}</th>
                <th scope="col" className="p-3 text-right font-semibold">{t("admin.pulse30")}</th>
                <th scope="col" className="p-3 text-right font-semibold">{t("admin.pulseAll")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {pulse.map(([icon, get, label]) => (
                <tr key={label} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="p-3 text-left font-normal"><span className="inline-flex items-center gap-1.5"><Icon name={icon} className="text-muted" /> {label}</span></th>
                  {periods.map((m, i) => <td key={i} className={`p-3 text-right ${i === 2 ? "font-bold" : ""}`}>{get(m)}</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row" className="p-3 text-left font-normal"><span className="inline-flex items-center gap-1.5"><Icon name="user-check" className="text-muted" /> {t("admin.pulseVerifiedGms")}</span></th>
                <td className="p-3 text-right text-muted">–</td>
                <td className="p-3 text-right text-muted">–</td>
                <td className="p-3 text-right font-bold">{verified}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm">
          <Link href="/admin/errors" className={`inline-flex items-center gap-1.5 hover:underline ${errors > 0 ? "font-semibold text-danger" : "text-muted"}`}>
            <Icon name="triangle-warning" /> {t("admin.pulseErrors", { n: errors })}
          </Link>
        </p>
      </section>

      <section className="mt-10" aria-labelledby="log-h">
        <h2 id="log-h" className="text-xl font-bold">{t("admin.logTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("admin.logLead")}</p>
        {log.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("admin.logEmpty")}</p>
        ) : (
          <ul className="card mt-4 divide-y divide-border">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span>
                  {t(`admin.log.${l.action}` as const, { admin: shownName(l.admin_name ?? "", t), target: shownName(l.target_name ?? "", t) })}
                  {l.detail && <span className="text-muted"> · {l.detail}</span>}
                </span>
                <span className="text-xs text-muted"><LocalTime iso={l.created_at} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
