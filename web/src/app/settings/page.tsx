import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getUserSettings } from "@/lib/queries";
import { Icon } from "@/components/icon";
import { ConfirmButton } from "@/components/submit-button";
import { PasswordForm, ProfileSettingsForm } from "@/components/settings-forms";
import { DeleteAccountForm, ResendVerificationButton } from "@/components/account-forms";
import { logoutEverywhereAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.title") };
}

/** Profile & account settings for every user; GMs also get a link to their GM profile. */
export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const { t } = await getI18n();
  const me = getUserSettings(user.id)!;
  const isGm = user.role === "gm" || user.role === "admin";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="settings" className="text-accent" /> {t("settings.title")}</h1>
      <p className="mt-1 text-muted">{t("settings.lead")}</p>

      <section className={`card mt-8 flex flex-wrap items-center gap-3 p-4 ${user.email_verified ? "" : "border-accent/50!"}`} aria-label={t("verify.statusLabel")}>
        <Icon name={user.email_verified ? "check-circle" : "envelope"} className={user.email_verified ? "text-success" : "text-accent"} />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{user.email}</span> · {user.email_verified ? t("verify.isVerified") : t("verify.notVerified")}
        </p>
        {!user.email_verified && <ResendVerificationButton />}
      </section>

      <section className="card mt-6 p-6" aria-labelledby="profile-h">
        <h2 id="profile-h" className="mb-5 flex items-center gap-2 text-xl font-bold"><Icon name="user-pen" className="text-muted" /> {t("settings.profile")}</h2>
        <ProfileSettingsForm defaults={{ name: me.name, email: me.email, bio: me.bio, hue: me.avatar_hue, avatarImage: me.avatar_image }} />
      </section>

      <section className="card mt-6 p-6" aria-labelledby="gm-h">
        <h2 id="gm-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="hat-wizard" className="text-muted" /> {t("settings.gmSection")}</h2>
        {isGm ? (
          <>
            <p className="mt-1 mb-4 text-sm text-muted">{t("settings.gmLead")}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/become-a-gm" className="btn-primary"><Icon name="pencil" /> {t("gmDash.editProfile")}</Link>
              <Link href={`/gms/${user.id}`} className="btn-secondary"><Icon name="eye" /> {t("gmDash.viewProfile")}</Link>
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

      <section className="card mt-6 p-6" aria-labelledby="pw-h">
        <h2 id="pw-h" className="mb-5 flex items-center gap-2 text-xl font-bold"><Icon name="lock" className="text-muted" /> {t("settings.password")}</h2>
        <PasswordForm />
      </section>

      <section className="card mt-6 p-6" aria-labelledby="sec-h">
        <h2 id="sec-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="shield-check" className="text-muted" /> {t("dash.securityTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("settings.securityLead")}</p>
        <form action={logoutEverywhereAction}>
          <ConfirmButton className="btn-secondary" message={t("dash.logoutEverywhereConfirm")}>
            <Icon name="sign-out-alt" /> {t("dash.logoutEverywhere")}
          </ConfirmButton>
        </form>
      </section>
      <section className="card mt-6 p-6" aria-labelledby="data-h">
        <h2 id="data-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="user-lock" className="text-muted" /> {t("data.title")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted">{t("data.lead")}</p>
        <a href="/api/me/export" download className="btn-secondary"><Icon name="file-download" /> {t("data.export")}</a>
      </section>

      <section className="card mt-6 border-danger/40! p-6" aria-labelledby="delete-h">
        <h2 id="delete-h" className="flex items-center gap-2 text-xl font-bold text-danger"><Icon name="trash" /> {t("delete.title")}</h2>
        <p className="mt-1 mb-4 whitespace-pre-line text-sm text-muted">{t(isGm ? "delete.leadGm" : "delete.lead")}</p>
        <DeleteAccountForm />
      </section>
    </div>
  );
}
