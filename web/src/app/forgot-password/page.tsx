import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { ForgotPasswordForm } from "@/components/account-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("reset.title") };
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-bold">{t("reset.title")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("reset.lead")}</p>
      <ForgotPasswordForm />
    </div>
  );
}
