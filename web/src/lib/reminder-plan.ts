import { formatWhen } from "./time-zones.ts";
// Which session reminders are due. Pure module (no server imports) so node --test can load it.
//
// Two reminders per person per session: "24h" (sent once the session is within a day) and
// "1h" (within the hour). Rules:
// - People who booked after a window opened don't get that reminder: they just saw the time.
// - When less than 2 hours remain, the 24h reminder is skipped; the 1h one follows shortly.
// - The GM gets both, for any session with at least one booked player.

export type ReminderKind = "24h" | "1h";

export type ReminderCandidate = {
  session_id: number;
  user_id: number;
  role: "player" | "gm";
  starts_at: string;
  booked_at: string | null; // players only
  sent: ReminderKind[];
};

const HOUR = 3_600_000;

export function planReminders(rows: ReminderCandidate[], now: Date): { session_id: number; user_id: number; kind: ReminderKind }[] {
  const out: { session_id: number; user_id: number; kind: ReminderKind }[] = [];
  for (const r of rows) {
    const start = new Date(r.starts_at).getTime();
    const lead = start - now.getTime();
    if (!(lead > 0) || lead > 24 * HOUR) continue;
    const kind: ReminderKind | null = lead <= HOUR ? "1h" : lead > 2 * HOUR ? "24h" : null;
    if (!kind || r.sent.includes(kind)) continue;
    const windowOpened = start - (kind === "1h" ? HOUR : 24 * HOUR);
    if (r.role === "player" && r.booked_at && new Date(r.booked_at).getTime() > windowOpened) continue;
    out.push({ session_id: r.session_id, user_id: r.user_id, kind });
  }
  return out;
}

/** "Sat 27 Sept, 19.00 WIB". Emails use formatWhen with the reader's zone (lib/time-zones.ts). */
export function formatWib(iso: string, lang: "en" | "id"): string {
  return formatWhen(iso, lang, "Asia/Jakarta");
}
