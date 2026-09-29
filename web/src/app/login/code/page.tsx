import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { currentChallenge } from "@/lib/two-step";
import { getI18n } from "@/lib/i18n/server";
import { LoginCodeForm } from "@/components/two-step-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("twoStep.loginTitle"), robots: { index: false } };
}

/** Second login step for accounts with two-step login (lib/two-step.ts). */
export default async function LoginCodePage() {
  if (await getCurrentUser()) redirect("/dashboard");
  if (!(await currentChallenge())) redirect("/login");
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-bold">{t("twoStep.loginTitle")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("twoStep.loginLead")}</p>
      <LoginCodeForm />
    </div>
  );
}
