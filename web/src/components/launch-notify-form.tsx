"use client";

import { useActionState } from "react";
import { joinLaunchListAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

/** /opening: one email when bookings open, then the address is deleted. */
export function LaunchNotifyForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(joinLaunchListAction, undefined);
  const fe = state?.fieldErrors ?? {};
  if (state?.ok) return <Notice tone="success">{t("prelaunch.thanks", { email: state.values?.email ?? "" })}</Notice>;
  return (
    <form action={action} className="space-y-3">
      <div>
        <label htmlFor="notifyEmail" className="label">{t("prelaunch.email")}</label>
        <input id="notifyEmail" name="email" type="email" autoComplete="email" required className="input" {...errAttrs("email", fe.email)} defaultValue={state?.values?.email} />
        <FieldError id="email" msg={fe.email && t(fe.email)} />
      </div>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary w-full"><Icon name="envelope" /> {t("prelaunch.submit")}</SubmitButton>
      <p className="text-xs text-muted">{t("prelaunch.privacy")}</p>
    </form>
  );
}
