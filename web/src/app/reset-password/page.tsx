import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { peekToken } from "@/lib/tokens";
import { ResetPasswordForm } from "@/components/account-forms";
import { Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("reset.newTitle"), robots: { index: false } };
}

/** Opened from the emailed link. The token is only used up when the new password is saved. */
export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { token } = await props.searchParams;
  const { t } = await getI18n();
  const raw = typeof token === "string" ? token : "";
  const valid = !!peekToken(raw, "reset");
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-bold">{t("reset.newTitle")}</h1>
      {valid ? (
        <>
          <p className="mt-1 mb-8 text-muted">{t("reset.newLead")}</p>
          <ResetPasswordForm token={raw} />
        </>
      ) : (
        <div className="mt-6 space-y-4">
          <Notice tone="danger">{t("err.tokenInvalid")}</Notice>
          <Link href="/forgot-password" className="btn-primary">{t("reset.again")}</Link>
        </div>
      )}
    </div>
  );
}
