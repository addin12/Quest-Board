// Pure: what can be reported, why, and validation of the report form.
import type { MsgKey } from "./i18n/dict";

export const REPORT_TARGETS = ["game", "review", "message", "request_message", "user"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ["scam", "harassment", "inappropriate", "spam", "misleading", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DECISIONS = ["remove", "suspend", "dismiss"] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export const isReportTarget = (v: unknown): v is ReportTarget => (REPORT_TARGETS as readonly unknown[]).includes(v);
export const isReportReason = (v: unknown): v is ReportReason => (REPORT_REASONS as readonly unknown[]).includes(v);
export const isReportDecision = (v: unknown): v is ReportDecision => (REPORT_DECISIONS as readonly unknown[]).includes(v);

export const reasonKey = (r: ReportReason) => `report.reason.${r}` as MsgKey;
export const targetKey = (t: ReportTarget) => `report.target.${t}` as MsgKey;

/** "Remove" makes sense for content; a person is handled with "suspend". */
export const canRemove = (t: ReportTarget) => t !== "user";

export type ReportInput = { targetType: ReportTarget; targetId: number; reason: ReportReason; details: string };

export function parseReport(raw: Record<string, unknown>):
  | { ok: true; value: ReportInput }
  | { ok: false; errors: Partial<Record<"reason" | "details" | "target", MsgKey>> } {
  const errors: Partial<Record<"reason" | "details" | "target", MsgKey>> = {};
  const targetType = raw.targetType;
  const targetId = Number(raw.targetId);
  const reason = raw.reason;
  const details = String(raw.details ?? "").trim();
  if (!isReportTarget(targetType) || !Number.isInteger(targetId) || targetId <= 0) errors.target = "err.notFound";
  if (!isReportReason(reason)) errors.reason = "v.reportReason";
  if (details.length > 1000) errors.details = "v.reportDetails";
  if (reason === "other" && details.length < 10) errors.details = "v.reportDetails";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { targetType: targetType as ReportTarget, targetId, reason: reason as ReportReason, details } };
}
