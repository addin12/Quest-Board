"use client";

import Link from "next/link";
import { useActionState } from "react";
import { deleteAccountAction, requestPasswordResetAction, resendVerificationAction, resetPasswordAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(requestPasswordResetAction, undefined);
  const fe = state?.fieldErrors ?? {};
  if (state?.ok) return <Notice tone="success">{t("reset.sent")}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label">{t("auth.email")}</label>
        <input id="email" {...errAttrs("email", fe.email)} name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.values?.email} />
        <FieldError id="email" msg={fe.email && t(fe.email)} />
      </div>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary w-full" pendingText={t("hire.sending")}><Icon name="paper-plane" /> {t("reset.send")}</SubmitButton>
      <p className="text-center text-sm"><Link href="/login" className="font-semibold text-accent">{t("reset.backToLogin")}</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="newPassword" className="label">{t("settings.newPassword")}</label>
        <input id="newPassword" {...errAttrs("newPassword", fe.newPassword)} name="newPassword" type="password" autoComplete="new-password" minLength={8} required className="input" />
        {fe.newPassword ? <FieldError id="newPassword" msg={t(fe.newPassword)} /> : <p className="mt-1 text-xs text-muted">{t("auth.passwordHint")}</p>}
      </div>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary w-full" pendingText={t("common.saving")}><Icon name="key" /> {t("reset.save")}</SubmitButton>
    </form>
  );
}

/** "Send the link again" for unverified emails (banner on My games, card in Settings). */
export function ResendVerificationButton({ className = "btn-secondary px-3! py-1.5! text-xs!" }: { className?: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(resendVerificationAction, undefined);
  if (state?.ok) return <span className="text-xs font-semibold text-success" role="status">{t("verify.resent")}</span>;
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <SubmitButton className={className} pendingText={t("hire.sending")}><Icon name="paper-plane" /> {t("verify.resend")}</SubmitButton>
      {state?.error && <span className="text-xs text-danger" role="alert">{t(state.error)}</span>}
    </form>
  );
}

export function DeleteAccountForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(deleteAccountAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <div className="max-w-sm">
        <label htmlFor="deletePassword" className="label">{t("delete.passwordLabel")}</label>
        <input id="deletePassword" {...errAttrs("deletePassword", fe.deletePassword)} name="password" type="password" autoComplete="current-password" required className="input" />
        <FieldError id="deletePassword" msg={fe.deletePassword && t(fe.deletePassword)} />
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input id="confirm" {...errAttrs("confirm", fe.confirm)} type="checkbox" name="confirm" className="mt-0.5 h-4 w-4 accent-[var(--danger)]" />
          <span>{t("delete.confirmLabel")}</span>
        </label>
        <FieldError id="confirm" msg={fe.confirm && t(fe.confirm)} />
      </div>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-danger" pendingText={t("delete.deleting")}><Icon name="trash" /> {t("delete.button")}</SubmitButton>
    </form>
  );
}
