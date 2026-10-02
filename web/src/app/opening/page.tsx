import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { isPrelaunch } from "@/lib/prelaunch";
import { Icon } from "@/components/icon";
import { LaunchNotifyForm } from "@/components/launch-notify-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("prelaunch.title") };
}

/** Pre-launch: leave your email to be told once when bookings open. Afterwards: "we're open". */
export default async function OpeningPage() {
  const { t } = await getI18n();
  const soon = isPrelaunch();
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="flex items-center gap-2 text-3xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("prelaunch.title")}</h1>
      {soon ? (
        <div className="mt-6 space-y-5">
          <p>{t("prelaunch.lead")}</p>
          <LaunchNotifyForm />
          <p className="text-sm text-muted">
            {t("prelaunch.areYouGm")} <Link href="/become-a-gm" className="font-semibold text-accent hover:underline">{t("prelaunch.gmLink")}</Link>
          </p>
        </div>
      ) : (
        <div className="mt-6"><Link href="/games" className="btn-primary">{t("prelaunch.open")}</Link></div>
      )}
    </div>
  );
}
