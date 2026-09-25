import type { T } from "@/lib/i18n/dict";
import { toggleFollowAction, toggleSaveAction } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";

/** Bookmark a game (server form; works without JS). */
export function SaveGameButton({ gameId, slug, saved, t }: { gameId: number; slug: string; saved: boolean; t: T }) {
  return (
    <form action={toggleSaveAction}>
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="save" value={saved ? "0" : "1"} />
      <SubmitButton className={`${saved ? "btn-primary" : "btn-secondary"} px-3! py-1.5! text-xs!`} ariaPressed={saved}>
        {saved ? <Icon name="bookmark" solid /> : <Icon name="bookmark" />} {t(saved ? "social.saved" : "social.save")}
      </SubmitButton>
    </form>
  );
}

export function FollowGmButton({ gmId, following, count, t }: { gmId: number; following: boolean; count: number; t: T }) {
  return (
    <form action={toggleFollowAction} className="flex items-center gap-2">
      <input type="hidden" name="gmId" value={gmId} />
      <input type="hidden" name="follow" value={following ? "0" : "1"} />
      <SubmitButton className={`${following ? "btn-primary" : "btn-secondary"} px-3! py-1.5! text-xs!`} ariaPressed={following}>
        {following ? <Icon name="heart" solid /> : <Icon name="heart" />} {t(following ? "social.following" : "social.follow")}
      </SubmitButton>
      <span className="text-xs text-muted">{t("social.followers", { n: count })}</span>
    </form>
  );
}
