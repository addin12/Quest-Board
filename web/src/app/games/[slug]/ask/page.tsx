import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getGameBySlug } from "@/lib/queries";
import { findQuestion } from "@/lib/questions";
import { Avatar, Notice } from "@/components/ui";
import { Icon } from "@/components/icon";
import { AskQuestionForm } from "@/components/question-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("ask.button"), robots: { index: false } };
}

/** Ask the GM about a game before booking. Reopens the existing thread if there is one. */
export default async function AskPage(props: PageProps<"/games/[slug]/ask">) {
  const { slug } = await props.params;
  const user = await requireUser(`/games/${slug}/ask`);
  const { t } = await getI18n();
  const game = getGameBySlug(slug);
  if (!game || game.status !== "published") notFound();
  if (game.gm_id === user.id) redirect("/gm/questions");
  const existing = findQuestion(game.id, user.id);
  if (existing) redirect(`/questions/${existing}`);
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link href={`/games/${game.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {game.title}</Link>
      <div className="mt-4 flex items-center gap-3">
        <Avatar name={game.gm_name} hue={game.gm_hue} image={game.gm_image} size={48} />
        <h1 className="text-2xl font-bold">{t("ask.title", { name: game.gm_name, title: game.title })}</h1>
      </div>
      <p className="mt-3 text-muted">{t("ask.lead")}</p>
      <div className="card mt-6 p-6">
        {!user.email_verified ? <Notice tone="info">{t("err.verifyEmail")}</Notice> : <AskQuestionForm gameId={game.id} />}
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted"><Icon name="shield-check" className="mt-0.5" /> {t("ask.safety")}</p>
    </div>
  );
}
