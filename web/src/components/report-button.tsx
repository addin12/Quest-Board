"use client";

import { useActionState, useId } from "react";
import { createReportAction, type FormState } from "@/app/actions";
import { REPORT_REASONS, reasonKey, targetKey, type ReportTarget } from "@/lib/reports";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

/**
 * "Report" disclosure: a small link that expands (in place) into a reason + details form.
 * Rendered only for signed-in people who don't own the content (the server re-checks both).
 */
export function ReportButton({ targetType, targetId, className = "" }: { targetType: ReportTarget; targetId: number; className?: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(createReportAction, undefined);
  const id = useId();
  const fe = state?.fieldErrors ?? {};
  const what = t(targetKey(targetType));

  if (state?.ok) {
    return <p className={`text-xs font-semibold text-success ${className}`} role="status"><Icon name="check-circle" solid /> {t("report.thanks")}</p>;
  }
  return (
    <details className={`group text-xs ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded px-1 text-muted hover:text-danger focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <Icon name="flag" /> {t("report.button")}<span className="sr-only">: {what}</span>
      </summary>
      <form action={action} className="parchment popover mt-2 max-w-md space-y-3 p-4 text-sm">
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <fieldset {...errAttrs(`${id}-reason`, fe.reason)}>
          <legend className="label">{t("report.why", { what })}</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2">
                <input type="radio" name="reason" value={r} defaultChecked={state?.values?.reason === r} className="accent-[var(--accent)]" />
                {t(reasonKey(r))}
              </label>
            ))}
          </div>
          <FieldError id={`${id}-reason`} msg={fe.reason && t(fe.reason)} />
        </fieldset>
        <div>
          <label htmlFor={`${id}-details`} className="label">{t("report.details")}</label>
          <textarea id={`${id}-details`} {...errAttrs(`${id}-details`, fe.details)} name="details" rows={3} maxLength={1000} className="input" placeholder={t("report.detailsPh")} defaultValue={state?.values?.details} />
          <FieldError id={`${id}-details`} msg={fe.details && t(fe.details)} />
        </div>
        {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
        <p className="text-xs text-muted">{t("report.privacy")}</p>
        <SubmitButton className="btn-danger px-3! py-1.5! text-xs!" pendingText={t("hire.sending")}><Icon name="flag" /> {t("report.send")}</SubmitButton>
      </form>
    </details>
  );
}
