"use client";

import { useActionState } from "react";
import { cancelLoginCodeAction, confirmTwoStepAction, disableTwoStepAction, loginCodeAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

// Forms for two-step login (lib/two-step.ts): the code at login, and turning it on or off in Settings.

function CodeInput({ error, autoFocus }: { error?: string; autoFocus?: boolean }) {
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor="code" className="label">{t("twoStep.code")}</label>
      <input
        id="code" {...errAttrs("code", error)} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7}
        required autoFocus={autoFocus} className="input max-w-40 font-mono text-lg tracking-widest"
      />
      <FieldError id="code" msg={error && t(error as Parameters<typeof t>[0])} />
    </div>
  );
}

export function LoginCodeForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(loginCodeAction, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <CodeInput error={state?.fieldErrors?.code} autoFocus />
        {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
        <SubmitButton className="btn-primary w-full" pendingText={t("twoStep.verifying")}>{t("nav.login")}</SubmitButton>
      </form>
      <form action={cancelLoginCodeAction}>
        <button className="text-sm font-semibold text-accent hover:underline">{t("twoStep.startOver")}</button>
      </form>
    </div>
  );
}

export function TwoStepConfirmForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(confirmTwoStepAction, undefined);
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <CodeInput error={state?.fieldErrors?.code} />
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary" pendingText={t("common.saving")}><Icon name="shield-check" /> {t("twoStep.confirm")}</SubmitButton>
    </form>
  );
}

export function TwoStepDisableForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(disableTwoStepAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">{t("twoStep.offHint")}</p>
      <CodeInput error={state?.fieldErrors?.code} />
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-secondary" pendingText={t("common.saving")}>{t("twoStep.turnOff")}</SubmitButton>
    </form>
  );
}
