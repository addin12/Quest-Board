import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { getQuestionThread, listQuestionMessages } from "@/lib/questions";
import { markQuestionRead } from "@/lib/notifications";
import { Avatar, Notice } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import { AutoRefresh } from "@/components/auto-refresh";
import { ReportButton } from "@/components/report-button";
import { QuestionReplyForm } from "@/components/question-forms";

export async function generateMetadata(props: PageProps<"/questions/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const { t } = await getI18n();
  const thread = getQuestionThread(Number(id));
  return { title: thread ? t("questions.title", { title: thread.game_title }) : t("questions.fallbackTitle"), robots: { index: false } };
}

/** A private pre-booking conversation: only the player, the GM (and admins) can open it. */
export default async function QuestionPage(props: PageProps<"/questions/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const user = await requireUser(`/questions/${id}`);
  const { t } = await getI18n();
  const thread = getQuestionThread(Number(id));
  if (!thread || (user.id !== thread.player_id && user.id !== thread.gm_id && user.role !== "admin")) notFound();
  markQuestionRead(user.id, thread.id);
  const isPlayer = user.id === thread.player_id;
  const other = isPlayer
    ? { id: thread.gm_id, name: thread.gm_name, hue: thread.gm_hue, image: thread.gm_image }
    : { id: thread.player_id, name: shownName(thread.player_name, t), hue: thread.player_hue, image: thread.player_image };
  const messages = listQuestionMessages(thread.id);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <AutoRefresh />
      <Link href={isPlayer ? "/dashboard" : "/gm/questions"} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t(isPlayer ? "dash.questions" : "gmQuestions.title")}</Link>
      <h1 className="mt-3 text-2xl font-bold">{t("questions.title", { title: thread.game_title })}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
        <span className="flex items-center gap-2"><Avatar name={other.name} hue={other.hue} image={other.image} size={28} /> {t("questions.with", { name: other.name })}</span>
        <Link href={`/games/${thread.game_slug}`} className="text-accent hover:underline">{thread.game_title}</Link>
        <ReportButton targetType="user" targetId={other.id} />
      </div>
      {sp.sent === "1" && <div className="mt-4"><Notice tone="success">{t("questions.sent", { name: other.name })}</Notice></div>}
      <p className="mt-4 text-xs text-muted">{t("questions.private", { name: other.name })}</p>
      <ul className="mt-4 space-y-3" aria-label={t("questions.title", { title: thread.game_title })}>
        {messages.map((m) => (
          <li key={m.id} className={`card p-3 ${m.user_id === user.id ? "ml-8 bg-accent-soft/40!" : "mr-8"}`}>
            <p className="flex items-center gap-2 text-sm">
              <Avatar name={shownName(m.name, t)} hue={m.avatar_hue} image={m.avatar_image} size={22} />
              <span className="font-semibold">{shownName(m.name, t)}</span>
              {m.user_id === thread.gm_id && <span className="rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">GM</span>}
              <span className="ml-auto text-xs text-muted"><LocalTime iso={m.created_at} /></span>
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{m.body}</p>
          </li>
        ))}
      </ul>
      {(isPlayer || user.id === thread.gm_id) && <div className="mt-4"><QuestionReplyForm questionId={thread.id} /></div>}
      {isPlayer && thread.game_status === "published" && (
        <p className="mt-6"><Link href={`/games/${thread.game_slug}`} className="btn-primary"><Icon name="ticket" /> {t("questions.bookCta")}</Link></p>
      )}
    </div>
  );
}
