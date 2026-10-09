import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, endedSessionReason } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { LoginForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.login") };
}

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, step, ended } = await props.searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const { t } = await getI18n();
  // A session ends 90 days after its login however active it was: say so, or it looks like a bug.
  const maxAge = ended === "max" || (await endedSessionReason()) === "max_age";
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-3xl font-bold">{t("auth.welcomeBack")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("auth.loginLead")}</p>
      {/* A two-step login that ended without a session (lib/two-step.ts). */}
      {(step === "expired" || step === "locked") && (
        <div className="-mt-4 mb-6"><Notice tone="danger">{t(step === "locked" ? "err.twoStepTooMany" : "err.twoStepExpired")}</Notice></div>
      )}
      {maxAge && <div className="-mt-4 mb-6" data-testid="ended-max-age"><Notice>{t("auth.endedMaxAge")}</Notice></div>}
      <LoginForm next={typeof next === "string" ? next : undefined} />
      <div className="mt-8 rounded-lg border border-dashed border-border p-4 text-xs text-muted">
        <p className="font-semibold text-text">{t("auth.demo")}</p>
        <p className="mt-1">{t("auth.demoPlayer")}{": player@questboard.test"}</p>
        <p>{t("auth.demoGm")}{": gm@questboard.test"}</p>
      </div>
    </div>
  );
}
