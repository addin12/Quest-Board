import Link from "next/link";
import type { T } from "@/lib/i18n/dict";
import type { NoticeRow } from "@/lib/community";
import { noticeTilt } from "@/lib/board";
import { Avatar, languageLabel } from "./ui";
import { LocalTime } from "./local-time";
import { Icon } from "./icon";

/** A parchment note pinned to the tavern board (server-safe). */
export function NoticeCard({ n, t }: { n: NoticeRow; t: T }) {
  const tilt = noticeTilt(n.id);
  return (
    <Link
      href={`/board/${n.id}`}
      className="notice group relative block p-5 pt-7 transition-transform hover:z-10 hover:rotate-0! hover:-translate-y-0.5 focus-visible:rotate-0!"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <Icon name="thumbtack" solid className="absolute left-1/2 top-1.5 -translate-x-1/2 text-lg text-accent drop-shadow" />
      <p className={`eyebrow ${n.kind === "lf_players" ? "text-success!" : "text-accent!"}`}>
        {t(n.kind === "lf_players" ? "board.kindPlayers" : "board.kindGroup")}
        {n.kind === "lf_players" && n.spots > 0 && <> · {t("board.spots", { n: n.spots })}</>}
      </p>
      <h3 className="mt-1 text-lg font-bold leading-snug group-hover:text-accent">{n.title}</h3>
      <p className="mt-1 line-clamp-3 text-sm text-muted">{n.body}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {n.system && <span className="chip gap-1"><Icon name="dice-d20" /> {n.system}</span>}
        <span className="chip gap-1"><Icon name={n.location_type === "online" ? "laptop" : "marker"} /> {n.location_type === "online" ? t("loc.online") : n.city}</span>
        <span className="chip gap-1"><Icon name="language" /> {languageLabel(n.language, t)}</span>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Icon name="calendar-clock" /> {n.schedule}</p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={n.author_name} hue={n.author_hue} image={n.author_image} size={22} />
          <span className="truncate">{n.author_name}</span> · <LocalTime iso={n.created_at} />
        </span>
        <span className="inline-flex shrink-0 items-center gap-1"><Icon name="comment" /> {n.reply_count}</span>
      </div>
    </Link>
  );
}
