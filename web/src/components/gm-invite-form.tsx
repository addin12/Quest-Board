"use client";

import { useActionState, useState } from "react";
import { createGmInviteAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";
import { FieldError, errAttrs } from "./ui";

/** Admin → GMs: make a founding-GM invite link. The link is shown once (only its hash is stored). */
export function GmInviteForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(createGmInviteAction, undefined);
  const [copied, setCopied] = useState(false);
  const link = state?.ok ? state.values?.link : undefined;
  return (
    <div className="space-y-3">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="inviteNote" className="label">{t("admin.inviteNote")}</label>
          <input id="inviteNote" name="note" maxLength={100} className="input" placeholder="Dewi · Bandung" />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="inviteEmail" className="label">{t("admin.inviteEmail")}</label>
          <input id="inviteEmail" name="email" type="email" className="input" placeholder="dewi@example.com" {...errAttrs("inviteEmail", state?.fieldErrors?.inviteEmail)} />
          <FieldError id="inviteEmail" msg={state?.fieldErrors?.inviteEmail && t(state.fieldErrors.inviteEmail)} />
        </div>
        <SubmitButton className="btn-primary"><Icon name="link-alt" /> {t("admin.inviteCreate")}</SubmitButton>
      </form>
      {link && (
        <div className="rounded-md bg-success-soft p-3 text-sm" role="status">
          {state?.values?.emailed && <p className="mb-1">{t("admin.inviteEmailed", { email: state.values.emailed })}</p>}
          <p className="font-semibold">{t("admin.inviteLink")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input readOnly value={link} className="input min-w-0 flex-1 font-mono text-xs" aria-label={t("admin.inviteLinkLabel")} data-testid="invite-link" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn-secondary px-3! py-1.5! text-sm!"
              onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))}
            >
              <Icon name="clipboard-list" /> {t(copied ? "admin.inviteCopied" : "admin.inviteCopy")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
