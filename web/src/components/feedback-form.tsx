"use client";

import { useActionState } from "react";
import { sendFeedbackAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

export function FeedbackForm({ signedIn, from }: { signedIn: boolean; from: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(sendFeedbackAction, undefined);
  const fe = state?.fieldErrors ?? {};
  if (state?.ok) return <Notice tone="success">{t("feedback.thanks")}</Notice>;
  const kind = state?.values?.kind ?? "bug";
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="page" value={from} />
      <fieldset>
        <legend className="label">{t("feedback.kind")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["bug", "idea", "other"] as const).map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="radio" name="kind" value={k} defaultChecked={kind === k} className="peer sr-only" />
              <span className="chip gap-1 py-1! peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                <Icon name={k === "bug" ? "exclamation" : k === "idea" ? "sparkles" : "comment"} /> {t(`feedback.kind.${k}`)}
              </span>
            </label>
          ))}
        </div>
        <FieldError id="kind" msg={fe.kind && t(fe.kind)} />
      </fieldset>
      <div>
        <label htmlFor="body" className="label">{t("feedback.body")}</label>
        <textarea id="body" name="body" rows={6} maxLength={2000} required className="input" placeholder={t("feedback.bodyPh")} defaultValue={state?.values?.body} {...errAttrs("body", fe.body)} />
        <FieldError id="body" msg={fe.body && t(fe.body)} />
      </div>
      {!signedIn && (
        <div>
          <label htmlFor="email" className="label">{t("feedback.email")}</label>
          <input id="email" name="email" type="email" className="input" defaultValue={state?.values?.email} {...errAttrs("email", fe.email)} />
          <FieldError id="email" msg={fe.email && t(fe.email)} />
        </div>
      )}
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("chat.sending")}><Icon name="paper-plane" /> {t("feedback.send")}</SubmitButton>
    </form>
  );
}
