// Pure: Tavern Notice Board (looking-for-group) types and validation.
import type { MsgKey } from "./i18n/dict";

export const NOTICE_KINDS = ["lf_group", "lf_players"] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
export const isNoticeKind = (v: unknown): v is NoticeKind => (NOTICE_KINDS as readonly unknown[]).includes(v);

/** Notices come down from the board by themselves after this many days. */
export const NOTICE_DAYS = 30;
export const MAX_SPOTS = 8;

export type NoticeInput = {
  kind: NoticeKind;
  title: string;
  system: string;
  locationType: "online" | "in_person";
  city: string;
  language: "id" | "en" | "both";
  schedule: string;
  spots: number; // 0 for "looking for a group"
  body: string;
};

type Errors = Partial<Record<"kind" | "title" | "city" | "schedule" | "spots" | "body", MsgKey>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseNotice(raw: Record<string, unknown>): { ok: true; value: NoticeInput } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const kind = raw.kind;
  const title = str(raw.title);
  const system = str(raw.system).slice(0, 60);
  const locationType = raw.locationType === "in_person" ? "in_person" : "online";
  const city = str(raw.city).slice(0, 60);
  const language = raw.language === "en" ? "en" : raw.language === "both" ? "both" : "id";
  const schedule = str(raw.schedule);
  const body = str(raw.body);
  const spots = kind === "lf_players" ? Math.floor(Number(str(raw.spots) || "0")) : 0;

  if (!isNoticeKind(kind)) errors.kind = "v.noticeKind";
  if (title.length < 5 || title.length > 80) errors.title = "v.requestTitle";
  if (locationType === "in_person" && !city) errors.city = "v.city";
  if (schedule.length < 3 || schedule.length > 200) errors.schedule = "v.schedule";
  if (kind === "lf_players" && (!Number.isInteger(spots) || spots < 1 || spots > MAX_SPOTS)) errors.spots = "v.spots";
  if (body.length < 20 || body.length > 1000) errors.body = "v.noticeBody";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { kind: kind as NoticeKind, title, system, locationType, city, language, schedule, spots, body } };
}

export function parseReply(raw: Record<string, unknown>): { ok: true; value: string } | { ok: false; error: MsgKey } {
  const body = str(raw.body);
  if (body.length < 2 || body.length > 1000) return { ok: false, error: "v.replyBody" };
  return { ok: true, value: body };
}

/** A small, stable tilt per notice so the board looks hand-pinned (−1.5° … +1.5°). */
export function noticeTilt(id: number): number {
  return (((id * 37) % 7) - 3) * 0.5;
}
