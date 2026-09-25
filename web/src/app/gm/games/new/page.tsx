import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { SYSTEMS } from "@/lib/validation";
import { EMPTY_GAME, GameForm } from "@/components/game-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("gameForm.newTitle") };
}

export default async function NewGamePage() {
  await requireGm();
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/gm" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("nav.gmDashboard")}</Link>
      <h1 className="mt-2 mb-2 text-3xl font-bold">{t("gameForm.newTitle")}</h1>
      <p className="mb-8 text-muted">{t("gameForm.newLead")}</p>
      <GameForm defaults={EMPTY_GAME} systems={SYSTEMS} />
    </div>
  );
}
