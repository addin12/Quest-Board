"use client";

import { useFormStatus } from "react-dom";

/**
 * Inside the "I've sent the payment" form on My games: the button, or what the player told the GM with an
 * Undo. Shows the new state the moment it's tapped (optimistic), reading the form being sent; the form
 * itself is a plain server form, so it works without JavaScript. The status line is always in the page
 * (empty until used), so screen readers announce it when it fills.
 */
export function PaidClaim({ sent, iSent, youSaid, undo }: { sent: boolean; iSent: React.ReactNode; youSaid: React.ReactNode; undo: string }) {
  const { pending, data } = useFormStatus();
  const shown = pending && data ? data.get("sent") === "1" : sent;
  return (
    <>
      <span className="inline-flex items-center gap-1 font-semibold text-muted empty:hidden" role="status">{shown ? youSaid : null}</span>
      {shown ? (
        <button type="submit" className="btn-ghost" disabled={pending} aria-busy={pending}>{undo}</button>
      ) : (
        <button type="submit" className="btn-secondary" disabled={pending} aria-busy={pending}>{iSent}</button>
      )}
    </>
  );
}
