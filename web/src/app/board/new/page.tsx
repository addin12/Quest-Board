import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { SYSTEMS } from "@/lib/validation";
import { NoticeForm } from "@/components/board-forms";
import { ResendVerificationButton } from "@/components/account-forms";
import { Notice } from "@/components/ui";
import { Icon } from "@/components/icon";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("board.pinNew") };
}

export default async function NewNoticePage() {
  const user = await requireUser("/board/new");
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("board.pageTitle")}</Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-bold"><Icon name="thumbtack" className="text-accent" /> {t("board.pinNew")}</h1>
      <p className="mt-1 mb-6 text-muted">{t("board.newLead")}</p>
      {!user.email_verified && (
        <div className="mb-5">
          <Notice><span className="flex flex-wrap items-center gap-x-3 gap-y-2">{t("err.verifyEmail")} <ResendVerificationButton /></span></Notice>
        </div>
      )}
      <div className="card p-6"><NoticeForm systems={SYSTEMS} /></div>
      <p className="mt-4 text-xs text-muted">{t("board.safetyNote")}</p>
    </div>
  );
}
