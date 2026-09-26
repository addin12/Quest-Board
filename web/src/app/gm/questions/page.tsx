import type { Metadata } from "next";
import Link from "next/link";
import { requireGm } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { listGmQuestions } from "@/lib/questions";
import { EmptyState } from "@/components/ui";
import { Icon } from "@/components/icon";
import { QuestionList } from "@/components/question-list";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("gmQuestions.title") };
}

export default async function GmQuestionsPage() {
  const gm = await requireGm();
  const { t } = await getI18n();
  const rows = listGmQuestions(gm.id).map((r) => ({ ...r, other_name: shownName(r.other_name, t) }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/gm" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("nav.gmDashboard")}</Link>
      <h1 className="mt-3 flex items-center gap-2 text-3xl font-bold"><Icon name="comment-dots" className="text-accent" /> {t("gmQuestions.title")}</h1>
      <p className="mt-1 text-muted">{t("gmQuestions.lead")}</p>
      <div className="mt-6">
        {rows.length === 0 ? <EmptyState title={t("gmQuestions.empty")} /> : <QuestionList rows={rows} awaitingLabel={t("gmQuestions.awaiting")} />}
      </div>
    </div>
  );
}
