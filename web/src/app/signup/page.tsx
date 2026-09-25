import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { SignupForm } from "@/components/auth-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("nav.signup") };
}

export default async function SignupPage(props: PageProps<"/signup">) {
  const { next, role } = await props.searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-3xl font-bold">{t("auth.joinTitle")}</h1>
      <p className="mt-1 mb-8 text-muted">{t("auth.joinLead")}</p>
      <SignupForm next={typeof next === "string" ? next : undefined} defaultRole={role === "gm" ? "gm" : "player"} />
    </div>
  );
}
