import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { devOutboxEnabled } from "@/lib/mailer";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("checkEmail.title"), robots: { index: false } };
}

/** After sign-up — the same page whether the address was new or already registered. */
export default async function CheckEmailPage() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <Icon name="envelope" className="text-5xl text-accent" />
      <h1 className="mt-4 text-3xl font-bold">{t("checkEmail.title")}</h1>
      <p className="mt-3">{t("checkEmail.lead")}</p>
      <p className="mt-3 text-sm text-muted">{t("checkEmail.spam")}</p>
      <p className="mt-8 text-sm">
        {t("checkEmail.haveAccount")} <Link href="/login" className="font-semibold text-accent underline">{t("nav.login")}</Link>
      </p>
      {devOutboxEnabled() && (
        <p className="mt-6 text-xs text-muted">
          {t("checkEmail.dev")} <Link href="/dev/outbox" className="underline">{"/dev/outbox"}</Link>
        </p>
      )}
    </div>
  );
}
