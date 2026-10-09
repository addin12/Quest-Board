import type { T } from "@/lib/i18n/dict";
import { toggleFollowAction, toggleSaveAction } from "@/app/actions";
import { ToggleSubmit } from "./submit-button";
import { Icon } from "./icon";

/** Bookmark a game (server form; works without JS). */
export function SaveGameButton({ gameId, slug, saved, t }: { gameId: number; slug: string; saved: boolean; t: T }) {
  return (
    <form action={toggleSaveAction}>
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="save" value={saved ? "0" : "1"} />
      <ToggleSubmit
        field="save" pressed={saved}
        onClass="btn-primary px-3! text-xs!" offClass="btn-secondary px-3! text-xs!"
        on={<><Icon name="bookmark" solid /> {t("social.saved")}</>} off={<><Icon name="bookmark" /> {t("social.save")}</>}
      />
    </form>
  );
}

export function FollowGmButton({ gmId, following, count, t }: { gmId: number; following: boolean; count: number; t: T }) {
  return (
    <form action={toggleFollowAction} className="flex items-center gap-2">
      <input type="hidden" name="gmId" value={gmId} />
      <input type="hidden" name="follow" value={following ? "0" : "1"} />
      <ToggleSubmit
        field="follow" pressed={following}
        onClass="btn-primary px-3! text-xs!" offClass="btn-secondary px-3! text-xs!"
        on={<><Icon name="heart" solid /> {t("social.following")}</>} off={<><Icon name="heart" /> {t("social.follow")}</>}
      />
      <span className="text-xs text-muted">{t("social.followers", { n: count })}</span>
    </form>
  );
}
