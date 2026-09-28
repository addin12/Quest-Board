import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { peekToken } from "@/lib/tokens";
import { getCurrentUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/submit-button";
import { confirmEmailAction } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("verify.title"), robots: { index: false } };
}

/**
 * Opened from the emailed link. Confirming takes a click (a POST): mail scanners open links on
 * their own, and a GET that used the link up would leave the person with "invalid".
 */
export default async function VerifyEmailPage(props: PageProps<"/verify-email">) {
  const { token, next } = await props.searchParams;
  const { t } = await getI18n();
  const raw = typeof token === "string" ? token : "";
  const valid = !!peekToken(raw, "verify");
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="envelope-open" className="text-accent" /> {t("verify.title")}</h1>
      {valid ? (
        <form action={confirmEmailAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={raw} />
          {typeof next === "string" && <input type="hidden" name="next" value={next} />}
          <p>{t("verify.confirmLead")}</p>
          <SubmitButton className="btn-primary w-full py-3!"><Icon name="check" /> {t("verify.confirmButton")}</SubmitButton>
        </form>
      ) : user?.email_verified ? (
        <div className="mt-6 space-y-6">
          <Notice tone="success">{t("verify.done")}</Notice>
          <Link href="/dashboard" className="btn-primary">{t("nav.myGames")}</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Notice tone="danger">{t("verify.invalidSignedOut")}</Notice>
          <div className="flex flex-wrap gap-2">
            <Link href="/login" className="btn-primary">{t("nav.login")}</Link>
            <Link href="/signup" className="btn-secondary">{t("nav.signup")}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
