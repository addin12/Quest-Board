// GM earnings (pure, so node --test can load it). Quest Board never handles money: amounts are
// the price when each seat was booked, and "paid" is the GM's own tick on the roster.

export type EarningRow = {
  booking_id: number; price_idr: number; paid: number; session_id: number; starts_at: string;
  game_id: number; title: string; player_name: string;
};

export type MonthSummary = { month: string; sessions: number; seats: number; expected: number; paid: number };

export type EarningsSummary = {
  months: MonthSummary[];     // past sessions, newest month first (WIB months)
  upcoming: { sessions: number; seats: number; expected: number };
  unpaid: EarningRow[];       // past, priced, not marked paid; oldest first
  outstanding: number;        // sum of unpaid
  thisMonth: MonthSummary;
};

const WIB_MS = 7 * 3_600_000;
/** "2026-09" for the month a timestamp falls in, in WIB. */
export const wibMonth = (iso: string | Date) => new Date(new Date(iso).getTime() + WIB_MS).toISOString().slice(0, 7);

export function summarizeEarnings(rows: EarningRow[], now = new Date()): EarningsSummary {
  const months = new Map<string, MonthSummary & { ids: Set<number> }>();
  const up = { ids: new Set<number>(), seats: 0, expected: 0 };
  const unpaid: EarningRow[] = [];
  for (const r of rows) {
    if (new Date(r.starts_at) > now) {
      up.ids.add(r.session_id); up.seats++; up.expected += r.price_idr;
      continue;
    }
    const key = wibMonth(r.starts_at);
    const m = months.get(key) ?? { month: key, sessions: 0, seats: 0, expected: 0, paid: 0, ids: new Set<number>() };
    m.ids.add(r.session_id); m.seats++; m.expected += r.price_idr;
    if (r.paid) m.paid += r.price_idr;
    else if (r.price_idr > 0) unpaid.push(r);
    months.set(key, m);
  }
  const list = [...months.values()].map(({ ids, ...m }) => ({ ...m, sessions: ids.size })).sort((a, b) => b.month.localeCompare(a.month));
  const current = wibMonth(now);
  unpaid.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return {
    months: list,
    upcoming: { sessions: up.ids.size, seats: up.seats, expected: up.expected },
    unpaid,
    outstanding: unpaid.reduce((n, r) => n + r.price_idr, 0),
    thisMonth: list.find((m) => m.month === current) ?? { month: current, sessions: 0, seats: 0, expected: 0, paid: 0 },
  };
}

/** A CSV cell: quoted, and never read as a formula by spreadsheets (=, +, -, @ …). */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export type RosterRow = {
  starts_at: string; session_status: string; player_name: string; seat_status: string; cancelled_by: string | null;
  price_idr: number; paid_marked_at: string | null; booked_at: string;
};

const wib = (iso: string) => new Date(new Date(iso).getTime() + WIB_MS).toISOString().slice(0, 16).replace("T", " ");

/** Every seat ever booked for one game, session by session (the GM's roster). */
export function rosterCsv(rows: RosterRow[]): string {
  const head = ["session_start_wib", "session_status", "player", "seat", "price_idr", "marked_paid", "booked_at_wib"];
  const seat = (r: RosterRow) => (r.seat_status === "confirmed" ? "booked" : r.cancelled_by === "gm" ? "cancelled by GM" : "cancelled by player");
  const lines = rows.map((r) => [wib(r.starts_at), r.session_status, r.player_name, seat(r), r.price_idr, r.paid_marked_at ? "yes" : "no", wib(r.booked_at)].map(csvCell).join(","));
  return "\uFEFF" + [head.join(","), ...lines].join("\r\n") + "\r\n";
}

/** One row per booked seat, for the GM's own bookkeeping. */
export function earningsCsv(rows: EarningRow[]): string {
  const head = ["session_start_wib", "game", "player", "price_idr", "marked_paid"];
  const lines = rows.map((r) => [
    new Date(new Date(r.starts_at).getTime() + WIB_MS).toISOString().slice(0, 16).replace("T", " "),
    r.title, r.player_name, r.price_idr, r.paid ? "yes" : "no",
  ].map(csvCell).join(","));
  return "\uFEFF" + [head.join(","), ...lines].join("\r\n") + "\r\n"; // BOM so Excel reads UTF-8
}
