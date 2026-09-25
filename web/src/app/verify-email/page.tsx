import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { consumeToken } from "@/lib/tokens";
import { getCurrentUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("verify.title"), robots: { index: false } };
}

/** Opened from the emailed link: marks the address verified (idempotent for the account). */
export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const { token } = await props.searchParams;
  const { t } = await getI18n();
  const userId = consumeToken(typeof token === "string" ? token : "", "verify");
  if (userId) {
    db().prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(new Date().toISOString(), userId);
  }
  // Some mail scanners open links before the person does; if they are already verified, say so.
  const ok = !!userId || !!(await getCurrentUser())?.email_verified;
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="envelope-open" className="text-accent" /> {t("verify.title")}</h1>
      <div className="mt-6">
        {ok ? <Notice tone="success">{t("verify.done")}</Notice> : <Notice tone="danger">{t("verify.invalid")}</Notice>}
      </div>
      <div className="mt-6 flex gap-2">
        <Link href="/dashboard" className="btn-primary">{t("nav.myGames")}</Link>
        {!ok && <Link href="/settings" className="btn-secondary">{t("settings.title")}</Link>}
      </div>
    </div>
  );
}
