"use client";

import { useFormStatus } from "react-dom";
import { useI18n } from "./i18n-provider";

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" disabled={pending} className={className} aria-busy={pending}>
      {pending ? (pendingText ?? t("common.working")) : children}
    </button>
  );
}

/** Submit button that asks for confirmation first (for destructive actions). */
export function ConfirmButton({
  children,
  message,
  className = "btn-danger",
  ariaLabel,
}: {
  children: React.ReactNode;
  message: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {pending ? t("common.working") : children}
    </button>
  );
}
