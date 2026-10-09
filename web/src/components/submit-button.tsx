"use client";

import { useFormStatus } from "react-dom";
import { useI18n } from "./i18n-provider";

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
  ariaPressed,
  ariaLabel,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  ariaPressed?: boolean;
  /** When the visible text alone is ambiguous (e.g. "Log out" on a list of devices). */
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <button type="submit" disabled={pending} className={className} aria-busy={pending} aria-pressed={ariaPressed} aria-label={ariaLabel}>
      {pending ? (pendingText ?? t("common.working")) : children}
    </button>
  );
}

/**
 * An on/off button (save, follow, paid) that shows its new state the moment it's tapped, while the form is
 * sent: `field` is the hidden input whose value "1" means "turn on". If the action fails, the page shows
 * the real state again when it reloads. The form stays a plain server form, so it works without JavaScript.
 */
export function ToggleSubmit({
  field, pressed, on, off, onClass, offClass, onLabel, offLabel,
}: {
  field: string;
  pressed: boolean;
  on: React.ReactNode;
  off: React.ReactNode;
  onClass: string;
  offClass: string;
  /** Accessible names when the visible text alone isn't enough (e.g. whose seat). */
  onLabel?: string;
  offLabel?: string;
}) {
  const { pending, data } = useFormStatus();
  const shown = pending && data ? data.get(field) === "1" : pressed;
  return (
    <button type="submit" disabled={pending} aria-busy={pending} aria-pressed={shown} aria-label={shown ? onLabel : offLabel} className={shown ? onClass : offClass}>
      {shown ? on : off}
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
