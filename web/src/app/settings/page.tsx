import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getUserSettings, getGmSettings } from "@/lib/queries";
import { Icon } from "@/components/icon";
import { EmailChangeForm, PasswordForm, ProfileSettingsForm } from "@/components/settings-forms";
import { pendingEmailChange } from "@/lib/email-change";
import { suppressionFor } from "@/lib/email-suppression";
import { DeleteAccountForm, ResendVerificationButton } from "@/components/account-forms";
import { logoutEverywhereAction, resetCalendarFeedAction, resumeEmailsAction } from "../actions";
import { CalendarFeedLinks } from "@/components/calendar-feed";
import { ConfirmButton, SubmitButton } from "@/components/submit-button";
import { siteOrigin } from "@/lib/site";
import { twoStepState, verifiedGmNeedsTwoStep } from "@/lib/two-step";
import { isSafeNext } from "@/lib/policy";
import { listLogins } from "@/lib/login-devices";
import { logoutDeviceAction } from "../actions";
import { TwoStepConfirmForm, TwoStepDisableForm } from "@/components/two-step-forms";
import { beginTwoStepAction, cancelTwoStepAction } from "../actions";
import { Notice } from "@/components/ui";
import { formatDay, formatMoment } from "@/lib/time-zones";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.title") };
}

/** Profile & account settings for every user; GMs also get a link to their GM profile. */
export default async function SettingsPage(props: PageProps<"/settings">) {
  // Where to go once two-step login is on (e.g. back to the GM profile form, which needs it).
  const next = (await props.searchParams).next;
  const afterTwoStep = isSafeNext(next) ? next : undefined;
  const user = await requireUser("/settings");
  const { t, lang } = await getI18n();
  const twoStep = await twoStepState(user.id, user.email);
  const logins = await listLogins(user.id);
  const me = getUserSettings(user.id)!;
  const stopped = suppressionFor(user.email); // the address bounced, or reported our email as spam
  const showTwoStep = user.role !== "player" || twoStep.state === "on";
  // In the person's own time zone (Settings → time zone), like their emails: "29 Sept 2026, 14.05 WITA".
  const when = (iso: string | null) => (iso ? formatMoment(new Date(iso), lang, me.time_zone) : "–");
  const origin = await siteOrigin();
  const isGm = user.role === "gm" || user.role === "admin";
  const gmProfile = isGm ? getGmSettings(user.id) : undefined; // the public page exists once the profile is filled in

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="settings" className="text-accent" /> {t("settings.title")}</h1>
      <p className="mt-1 text-muted">{t("settings.lead")}</p>
      <nav aria-label={t("settings.jumpTo")} className="mt-4">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {([
            ["profile", t("settings.profile")],
            ["calendar", t("cal.feedTitle")],
            ["game-master", t("settings.gmSection")],
            ["login-email", t("settings.loginEmail")],
            ["password", t("settings.password")],
            ...(showTwoStep ? [["two-step", t("twoStep.title")]] : []),
            ["security", t("dash.securityTitle")],
            ["your-data", t("data.title")],
            ["delete", t("delete.title")],
          ] as [string, string][]).map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="font-semibold text-accent hover:underline">{label}</a></li>
          ))}
        </ul>
      </nav>

      <section className={`card mt-8 flex flex-wrap items-center gap-3 p-4 ${user.email_verified ? "" : "border-accent/50!"}`} aria-label={t("verify.statusLabel")}>
        <Icon name={user.email_verified ? "check-circle" : "envelope"} className={user.email_verified ? "text-success" : "text-accent"} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{user.email}</span> · {user.email_verified ? t("verify.isVerified") : t("verify.notVerified")}
        </p>
        {!user.email_verified && <ResendVerificationButton />}
      </section>
      {stopped && (
        <section className="card mt-4 space-y-3 border-danger/40! p-4" aria-label={t("settings.emailsStopped")} data-testid="emails-stopped">
          <Notice tone="danger">{t(stopped.reason === "complaint" ? "settings.complained" : "settings.bounced", { email: user.email })}</Notice>
          <div className="flex flex-wrap items-center gap-3">
            <form action={resumeEmailsAction}><SubmitButton className="btn-secondary">{t("settings.emailsTryAgain")}</SubmitButton></form>
            <a href="#login-email" className="text-sm font-semibold text-accent hover:underline">{t("settings.loginEmail")}</a>
          </div>
        </section>
      )}

      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="profile-h" id="profile">
        <h2 id="profile-h" className="mb-5 flex items-center gap-2 text-xl font-bold"><Icon name="user-pen" className="text-muted" /> {t("settings.profile")}</h2>
        <ProfileSettingsForm defaults={{ name: me.name, email: me.email, bio: me.bio, hue: me.avatar_hue, avatarImage: me.avatar_image, emailReminders: !!me.email_reminders, emailNotifications: !!me.email_notifications, timeZone: me.time_zone }} />
      </section>

      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="cal-h" id="calendar">
        <h2 id="cal-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="calendar-clock" className="text-muted" /> {t("cal.feedTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("cal.feedLead")}</p>
        {me.calendar_token ? (
          <>
            <CalendarFeedLinks url={`${origin}/api/calendar/${me.calendar_token}.ics`} />
            <form action={resetCalendarFeedAction} className="mt-4">
              <p className="mb-2 text-xs text-muted">{t("cal.feedResetHint")}</p>
              <ConfirmButton className="btn-ghost" message={t("cal.feedResetConfirm")}><Icon name="key" /> {t("cal.feedReset")}</ConfirmButton>
            </form>
          </>
        ) : (
          <form action={resetCalendarFeedAction}>
            <SubmitButton className="btn-primary"><Icon name="calendar-plus" /> {t("cal.feedCreate")}</SubmitButton>
          </form>
        )}
      </section>

      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="gm-h" id="game-master">
        <h2 id="gm-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="hat-wizard" className="text-muted" /> {t("settings.gmSection")}</h2>
        {isGm ? (
          <>
            <p className="mt-1 mb-4 text-sm text-muted">{t("settings.gmLead")}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/become-a-gm" className="btn-primary"><Icon name="pencil" /> {t("gmDash.editProfile")}</Link>
              {gmProfile?.headline && <Link href={`/gms/${user.id}`} className="btn-secondary"><Icon name="eye" /> {t("gmDash.viewProfile")}</Link>}
              <Link href="/gm/requests" className="btn-secondary"><Icon name="inbox" /> {t("gmRequests.title")}</Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 mb-4 text-sm text-muted">{t("settings.becomeGmLead")}</p>
            <Link href="/become-a-gm" className="btn-secondary"><Icon name="arrow-right" /> {t("nav.becomeGm")}</Link>
          </>
        )}
      </section>

      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="login-email-h" id="login-email">
        <h2 id="login-email-h" className="mb-5 flex items-center gap-2 text-xl font-bold"><Icon name="envelope" className="text-muted" /> {t("settings.loginEmail")}</h2>
        <EmailChangeForm pending={pendingEmailChange(user.id)} />
      </section>

      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="pw-h" id="password">
        <h2 id="pw-h" className="mb-5 flex items-center gap-2 text-xl font-bold"><Icon name="lock" className="text-muted" /> {t("settings.password")}</h2>
        <PasswordForm />
      </section>

      {showTwoStep && (
        <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="two-step-h" id="two-step">
          {user.role === "admin" && !user.admin && (
            <div className="mb-4"><Notice tone="danger">{t("twoStep.adminRequired")}</Notice></div>
          )}
          <h2 id="two-step-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="fingerprint" className="text-muted" /> {t("twoStep.title")}</h2>
          {twoStep.state === "off" && (
            <>
              <p className="mt-2 max-w-prose text-sm text-muted">{t("twoStep.lead")}</p>
              {user.role === "gm" && <p className="mt-2 max-w-prose text-sm text-muted">{t(verifiedGmNeedsTwoStep(user.id) ? "twoStep.verifiedGmLead" : "twoStep.gmLead")}</p>}
              <form action={beginTwoStepAction} className="mt-4"><SubmitButton className="btn-primary"><Icon name="shield-check" /> {t("twoStep.setUp")}</SubmitButton></form>
            </>
          )}
          {twoStep.state === "pending" && (
            <div className="mt-4 space-y-5">
              <div>
                <p className="font-semibold">{t("twoStep.scan")}</p>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URI made on the server, nothing to optimise */}
                <img src={twoStep.qr} alt={t("twoStep.qrAlt")} width={176} height={176} className="mt-3 rounded-lg bg-white p-2" />
                <p className="mt-3 text-sm text-muted">{t("twoStep.manualKey")}</p>
                <p className="mt-1 font-mono text-sm tracking-wider break-all select-all" data-testid="totp-key">{twoStep.secret.match(/.{1,4}/g)!.join(" ")}</p>
              </div>
              <div>
                <p className="mb-3 font-semibold">{t("twoStep.enterCode")}</p>
                <TwoStepConfirmForm next={afterTwoStep} />
              </div>
              <form action={cancelTwoStepAction}><button className="text-sm font-semibold text-accent hover:underline">{t("twoStep.cancel")}</button></form>
            </div>
          )}
          {twoStep.state === "on" && (
            <div className="mt-2 space-y-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-success"><Icon name="check-circle" /> {t("twoStep.on", { date: formatDay(new Date(twoStep.since), lang, me.time_zone, true) })}</p>
              <TwoStepDisableForm />
              <p className="text-xs text-muted">{t("twoStep.lostPhone")}</p>
            </div>
          )}
        </section>
      )}

      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="sec-h" id="security">
        <h2 id="sec-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="shield-check" className="text-muted" /> {t("dash.securityTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("settings.securityLead")}</p>
        <h3 id="devices" className="font-semibold">{t("devices.title")}</h3>
        <ul className="mt-2 mb-5 divide-y divide-border rounded-lg border border-border" aria-labelledby="devices">
          {logins.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="login-row">
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  <Icon name="laptop" className="text-muted" /> {l.device || t("devices.unknown")}
                  {l.current && <span className="badge">{t("devices.thisDevice")}</span>}
                </span>
                <span className="block text-xs text-muted">{t("devices.meta", { since: when(l.created_at), seen: when(l.last_seen_at) })}</span>
              </span>
              {!l.current && (
                <form action={logoutDeviceAction}>
                  <input type="hidden" name="id" value={l.id} />
                  <SubmitButton className="btn-ghost px-3! py-1! text-xs!" ariaLabel={t("devices.logOutNamed", { device: l.device || t("devices.unknown") })}>{t("devices.logOut")}</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <form action={logoutEverywhereAction}>
          <ConfirmButton className="btn-secondary" message={t("dash.logoutEverywhereConfirm")}>
            <Icon name="sign-out-alt" /> {t("dash.logoutEverywhere")}
          </ConfirmButton>
        </form>
      </section>
      <section className="card mt-6 scroll-mt-24 p-6" aria-labelledby="data-h" id="your-data">
        <h2 id="data-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="user-lock" className="text-muted" /> {t("data.title")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("data.lead")}</p>
        <a href="/api/me/export" download className="btn-secondary"><Icon name="file-download" /> {t("data.export")}</a>
      </section>

      <section className="card mt-6 scroll-mt-24 border-danger/40! p-6" aria-labelledby="delete-h" id="delete">
        <h2 id="delete-h" className="flex items-center gap-2 text-xl font-bold text-danger"><Icon name="trash" /> {t("delete.title")}</h2>
        <p className="mt-1 mb-4 whitespace-pre-line text-sm text-muted">{t(isGm ? "delete.leadGm" : "delete.lead")}</p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
