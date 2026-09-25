import type { T } from "@/lib/i18n/dict";
import { Icon } from "./icon";

/** "Add to calendar": Google Calendar link + .ics download (Apple, Outlook, …). Server-safe. */
export function CalendarLinks({ sessionId, google, t, compact = false }: { sessionId: number; google: string; t: T; compact?: boolean }) {
  const cls = compact ? "inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline" : "btn-secondary px-3! py-1.5! text-xs!";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1" role="group" aria-label={t("cal.add")}>
      {!compact && <span className="text-xs text-muted">{t("cal.add")}:</span>}
      <a href={google} target="_blank" rel="noopener noreferrer" className={cls}>
        <Icon name="calendar-plus" /> {t("cal.google")}
      </a>
      <a href={`/api/sessions/${sessionId}/ics`} download className={cls}>
        <Icon name="download" /> {t("cal.ics")}
      </a>
    </span>
  );
}
