import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { shownName } from "@/lib/i18n/dict";
import { getNotice, listReplies } from "@/lib/community";
import { Avatar, Notice, languageLabel } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { Icon } from "@/components/icon";
import { ReplyForm } from "@/components/board-forms";
import { ReportButton } from "@/components/report-button";
import { ShareButtons } from "@/components/share-buttons";
import { ConfirmButton } from "@/components/submit-button";
import { AutoRefresh } from "@/components/auto-refresh";
import { closeNoticeAction, renewNoticeAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { NOTICE_DAYS } from "@/lib/board";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata(props: PageProps<"/board/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const n = getNotice(Number(id));
  return n ? { title: n.title, description: n.body.slice(0, 150) } : {};
}

export default async function NoticePage(props: PageProps<"/board/[id]">) {
  const { id } = await props.params;
  const { posted, edited } = await props.searchParams;
  const { t } = await getI18n();
  const n = getNotice(Number(id));
  const user = await getCurrentUser();
  if (!n) notFound();
  const now = new Date();
  const expired = new Date(n.expires_at) <= now;
  // The author may keep it up once it's within a week of coming down (or just came down).
  const renewable = new Date(n.expires_at).getTime() - now.getTime() < 7 * 86_400_000;
  const isAuthor = user?.id === n.author_id;
  const open = n.status === "open" && !expired;
  const replies = listReplies(n.id);
  // Taken-down or expired notices stay readable only for the author, people who replied, and admins.
  if (!open && !isAuthor && user?.role !== "admin" && !replies.some((r) => r.author_id === user?.id)) notFound();
  const url = `${await siteOrigin()}/board/${n.id}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <AutoRefresh />
      <Link href="/board" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"><Icon name="arrow-left" /> {t("board.pageTitle")}</Link>
      {posted && isAuthor && <div className="mt-4"><Notice tone="success">{t("board.posted")}</Notice></div>}
      {edited && isAuthor && <div className="mt-4"><Notice tone="success">{t("board.edited")}</Notice></div>}
      {isAuthor && n.status === "open" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
          <span className="flex-1">
            {t(expired ? "board.cameDown" : "board.upUntil")} <LocalTime iso={n.expires_at} mode="date" />
          </span>
          <Link href={`/board/${n.id}/edit`} className="btn-secondary px-3! py-1.5! text-xs!"><Icon name="pencil" /> {t("board.edit")}</Link>
          {renewable && (
            <form action={renewNoticeAction}>
              <input type="hidden" name="postId" value={n.id} />
              <SubmitButton className="btn-primary px-3! py-1.5! text-xs!"><Icon name="calendar-plus" /> {t("board.renew", { n: NOTICE_DAYS })}</SubmitButton>
            </form>
          )}
        </div>
      )}
      {!open && <div className="mt-4"><Notice>{t(expired ? "board.expired" : "board.closed")}</Notice></div>}

      <article className="notice relative mt-6 p-6 pt-9">
        <Icon name="thumbtack" solid className="absolute left-1/2 top-2 -translate-x-1/2 text-xl text-accent drop-shadow" />
        <p className={`eyebrow ${n.kind === "lf_players" ? "text-success!" : "text-accent!"}`}>
          {t(n.kind === "lf_players" ? "board.kindPlayers" : "board.kindGroup")}
          {n.kind === "lf_players" && n.spots > 0 && <> · {t("board.spots", { n: n.spots })}</>}
        </p>
        <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{n.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted">
          <Avatar name={n.author_name} hue={n.author_hue} image={n.author_image} size={24} /> {shownName(n.author_name, t)} · <LocalTime iso={n.created_at} />
        </p>
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          {n.system && <div className="flex items-center gap-2"><dt className="sr-only">{t("browse.system")}</dt><Icon name="dice-d20" className="text-muted" /><dd>{n.system}</dd></div>}
          <div className="flex items-center gap-2"><dt className="sr-only">{t("browse.where")}</dt><Icon name={n.location_type === "online" ? "laptop" : "marker"} className="text-muted" /><dd>{n.location_type === "online" ? t("loc.online") : n.city}</dd></div>
          <div className="flex items-center gap-2"><dt className="sr-only">{t("browse.language")}</dt><Icon name="language" className="text-muted" /><dd>{languageLabel(n.language, t)}</dd></div>
          <div className="flex items-center gap-2"><dt className="sr-only">{t("hire.schedule")}</dt><Icon name="calendar-clock" className="text-muted" /><dd>{n.schedule}</dd></div>
        </dl>
        <p className="mt-4 whitespace-pre-line leading-relaxed">{n.body}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {open && <ShareButtons url={url} text={t("board.shareText", { title: n.title })} />}
          {user && !isAuthor && <ReportButton targetType="lfg_post" targetId={n.id} />}
          {isAuthor && open && (
            <form action={closeNoticeAction} className="ml-auto">
              <input type="hidden" name="postId" value={n.id} />
              <ConfirmButton className="btn-ghost px-3! py-1.5! text-xs!" message={t("board.closeConfirm")}><Icon name="archive" /> {t("board.close")}</ConfirmButton>
            </form>
          )}
        </div>
      </article>

      <section className="mt-8" aria-labelledby="replies-h">
        <h2 id="replies-h" className="flex items-center gap-2 text-xl font-bold"><Icon name="comment" className="text-accent" /> {t("board.replies", { n: replies.length })}</h2>
        <p className="text-sm text-muted">{t("board.repliesLead")}</p>
        <ul className="mt-4 space-y-4">
          {replies.map((r) => (
            <li key={r.id} className="flex gap-3">
              <Avatar name={r.name} hue={r.avatar_hue} image={r.avatar_image} size={32} />
              <div className="min-w-0">
                <p className="text-sm"><span className="font-semibold">{shownName(r.name, t)}</span>{r.author_id === n.author_id && <span className="ml-1.5 rounded bg-accent-soft px-1.5 text-xs font-semibold text-accent">{t("board.author")}</span>}<span className="ml-2 text-xs text-muted"><LocalTime iso={r.created_at} /></span></p>
                <p className="whitespace-pre-line text-sm">{r.body}</p>
                {user && r.author_id !== user.id && <ReportButton targetType="lfg_reply" targetId={r.id} className="mt-1" />}
              </div>
            </li>
          ))}
          {replies.length === 0 && <li className="text-sm text-muted">{t("board.noReplies")}</li>}
        </ul>
        <div className="mt-5">
          {!open ? null : user ? (
            <ReplyForm postId={n.id} />
          ) : (
            <Link href={`/login?next=/board/${n.id}`} className="btn-secondary"><Icon name="sign-in-alt" /> {t("board.loginToReply")}</Link>
          )}
        </div>
      </section>
    </div>
  );
}
