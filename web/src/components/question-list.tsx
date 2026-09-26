import Link from "next/link";
import type { QuestionSummary } from "@/lib/questions";
import { Avatar } from "./ui";
import { LocalTime } from "./local-time";

/** Question threads (GM inbox, My games): who, which game, the last message, and whose turn it is. */
export function QuestionList({ rows, awaitingLabel }: { rows: QuestionSummary[]; awaitingLabel: string }) {
  return (
    <ul className="card divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={`/questions/${r.id}`} className="flex items-start gap-3 p-4 hover:bg-surface-2">
            <Avatar name={r.other_name} hue={r.other_hue} image={r.other_image} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-semibold">{r.other_name}</span>
                <span className="text-muted">· {r.game_title}</span>
                {r.awaiting ? <span className="rounded bg-accent px-1.5 text-xs font-semibold text-accent-ink">{awaitingLabel}</span> : null}
              </span>
              <span className="mt-0.5 block truncate text-sm text-muted">{r.last_body}</span>
            </span>
            <span className="shrink-0 text-xs text-muted"><LocalTime iso={r.last_at} /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
