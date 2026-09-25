import Link from "next/link";
import type { T } from "@/lib/i18n/dict";
import type { MyWait } from "@/lib/waitlist";
import { joinWaitlistAction, leaveWaitlistAction } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { LocalTime } from "./local-time";
import { Icon } from "./icon";

/** Full session: join the waitlist, or show your place in line (server-safe; forms post server actions). */
export function WaitlistControls({ sessionId, slug, wait, signedIn, t }: { sessionId: number; slug: string; wait?: MyWait; signedIn: boolean; t: T }) {
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/games/${slug}`)}`} className="btn-secondary gap-1.5! px-3! py-1.5! text-xs!">
        <Icon name="hourglass-end" /> {t("wait.join")}
      </Link>
    );
  }
  if (wait?.status === "waiting") {
    return (
      <span className="flex flex-col items-end gap-1 text-right">
        <span className="chip gap-1"><Icon name="hourglass-end" /> {t("wait.position", { n: wait.position })}</span>
        <form action={leaveWaitlistAction}>
          <input type="hidden" name="sessionId" value={sessionId} />
          <SubmitButton className="text-xs font-semibold text-muted underline hover:text-danger">{t("wait.leave")}</SubmitButton>
        </form>
      </span>
    );
  }
  return (
    <form action={joinWaitlistAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton className="btn-secondary gap-1.5! px-3! py-1.5! text-xs!"><Icon name="hourglass-end" /> {t("wait.join")}</SubmitButton>
    </form>
  );
}

/** "A seat opened up for you": claim link plus the deadline. */
export function WaitlistOffer({ sessionId, expiresAt, t }: { sessionId: number; expiresAt: string | null; t: T }) {
  return (
    <span className="flex flex-col items-end gap-1 text-right">
      <Link href={`/book/${sessionId}`} className="btn-primary gap-1.5! px-3! py-1.5!"><Icon name="ticket" /> {t("wait.claim")}</Link>
      {expiresAt && <span className="text-xs text-accent">{t("wait.heldUntil")} <LocalTime iso={expiresAt} /></span>}
    </span>
  );
}
