import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { peekEmailChange } from "@/lib/email-change";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/submit-button";
import { confirmEmailChangeAction } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("emailChange.title"), robots: { index: false } };
}

/**
 * Opened from the link sent to the new address. Confirming takes a click (a POST): mail scanners open
 * links on their own. Works signed out — the link proves the new inbox, the password was checked before.
 */
export default async function ChangeEmailPage(props: PageProps<"/change-email">) {
  const { token, taken } = await props.searchParams;
  const { t } = await getI18n();
  const raw = typeof token === "string" ? token : "";
  const change = peekEmailChange(raw);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="envelope-open" className="text-accent" /> {t("emailChange.title")}</h1>
      {change ? (
        <form action={confirmEmailChangeAction} className="mt-6 space-y-4">
          <input type="hidden" name="token" value={raw} />
          <p>{t("emailChange.confirmLead", { email: change.newEmail })}</p>
          <SubmitButton className="btn-primary w-full py-3!"><Icon name="check" /> {t("emailChange.confirmButton")}</SubmitButton>
        </form>
      ) : (
        <div className="mt-6 space-y-6">
          <Notice tone="danger">{t(taken ? "emailChange.taken" : "emailChange.invalid")}</Notice>
          <Link href="/settings" className="btn-primary">{t("settings.title")}</Link>
        </div>
      )}
    </div>
  );
}
