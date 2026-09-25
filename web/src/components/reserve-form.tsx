"use client";

import { useActionState } from "react";
import { reserveSeatAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { Notice } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

export function ReserveForm({ sessionId, priceText, isFree }: { sessionId: number; priceText: string; isFree: boolean }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(reserveSeatAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-4 text-sm">
        <p className="eyebrow flex items-center gap-1.5"><Icon name="wallet" /> {t("book.howPaymentWorks")}</p>
        {isFree ? (
          <p>{t("book.freeGame")}</p>
        ) : (
          <>
            <p>{t("book.payDirect", { price: priceText })}</p>
            <p className="text-muted">{t("book.payDetailsAfter")}</p>
          </>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" className="mt-1 accent-[var(--accent)]" required />
        <span>{t("book.agree")}</span>
      </label>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary w-full py-3!" pendingText={t("book.reserving")}>
        <Icon name="ticket" /> {t("book.reserve")}
      </SubmitButton>
    </form>
  );
}
