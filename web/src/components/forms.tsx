"use client";

import { useActionState, useEffect, useRef, useSyncExternalStore } from "react";
import { postMessageAction, submitReviewAction, addSessionAction, rescheduleSessionAction, replyReviewAction, updateReviewAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

/** The game's GM answers a review publicly (leave it empty to remove the answer). */
export function ReviewReplyForm({ reviewId, current }: { reviewId: number; current: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(replyReviewAction, undefined);
  const id = `reply-${reviewId}`;
  return (
    <details className="mt-2">
      <summary className="btn-ghost inline-flex cursor-pointer list-none px-2! py-1! text-xs [&::-webkit-details-marker]:hidden">
        <Icon name="comment" /> {current ? t("reviews.editReply") : t("reviews.reply")}
      </summary>
      <form action={action} className="mt-2 space-y-2">
        <input type="hidden" name="reviewId" value={reviewId} />
        <label htmlFor={id} className="label">{t("reviews.replyLabel")}</label>
        <textarea id={id} name="reply" rows={3} maxLength={1000} defaultValue={state?.values?.reply ?? current} className="input" />
        <p className="text-xs text-muted">{t("reviews.replyHint")}</p>
        {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
        <SubmitButton className="btn-primary py-1.5!" pendingText={t("common.saving")}>{t("reviews.replySave")}</SubmitButton>
      </form>
    </details>
  );
}

/** A new review, or (with `existing`) the reviewer editing theirs. */
export function ReviewForm({ gameId, existing }: { gameId: number; existing?: { id: number; rating: number; body: string } }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(existing ? updateReviewAction : submitReviewAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const p = existing ? "edit-" : ""; // distinct ids when both could be on a page
  const rating = state?.values?.rating ?? (existing ? String(existing.rating) : undefined);
  const ref = useRef<HTMLFormElement>(null);
  // Saved an edit: fold the "Edit your review" panel away again.
  useEffect(() => {
    if (existing && state?.ok) ref.current?.closest("details")?.removeAttribute("open");
  }, [existing, state]);
  return (
    <form ref={ref} action={action} className={existing ? "mt-2 space-y-3" : "card space-y-3 p-5"}>
      <input type="hidden" name="gameId" value={gameId} />
      {existing && <input type="hidden" name="reviewId" value={existing.id} />}
      {!existing && <h3 className="font-semibold">{t("reviews.formTitle")}</h3>}
      <fieldset {...errAttrs(`${p}rating`, fe.rating)}>
        <legend className="sr-only">{t("reviews.rating")}</legend>
        <div className="flex flex-row-reverse justify-end gap-1">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="relative cursor-pointer">
              <input type="radio" name="rating" value={n} className="peer sr-only" required defaultChecked={rating === String(n)} />
              <span
                className="flex text-2xl text-border peer-checked:text-gold peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
                title={t("reviews.starsLabel", { n })}
              >
                <Icon name="star" solid />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <FieldError id={`${p}rating`} msg={fe.rating && t(fe.rating)} />
      <label htmlFor={`${p}review-body`} className="sr-only">{t("reviews.review")}</label>
      <textarea id={`${p}review-body`} {...errAttrs(`${p}review-body`, fe.body)} name="body" rows={3} className="input" placeholder={t("reviews.placeholder")} defaultValue={state?.values?.body ?? existing?.body} />
      <FieldError id={`${p}review-body`} msg={fe.body && t(fe.body)} />
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={existing ? t("common.saving") : t("reviews.posting")}>{existing ? t("reviews.save") : t("reviews.post")}</SubmitButton>
    </form>
  );
}

export function MessageForm({ gameId }: { gameId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(postMessageAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="gameId" value={gameId} />
      <label htmlFor="msg" className="sr-only">{t("chat.message")}</label>
      <textarea id="msg" name="body" rows={2} maxLength={1000} required className="input" placeholder={t("chat.placeholder")} defaultValue={state?.values?.body} />
      <SubmitButton pendingText={t("chat.sending")}><Icon name="paper-plane" /> {t("chat.send")}</SubmitButton>
      {state?.error && <p className="text-xs text-danger">{t(state.error)}</p>}
    </form>
  );
}

const noop = () => () => {};

/** The browser's IANA time zone after hydration ("" on the server). */
export function useBrowserTimeZone(): string {
  return useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "", () => "");
}

/** Hidden "tz" field: sign-up stores it as the account's zone for emails (lib/time-zones.ts). */
export function BrowserTimeZoneInput() {
  return <input type="hidden" name="tz" value={useBrowserTimeZone()} />;
}

/** An ISO time as a `datetime-local` value in the browser's timezone. */
function localInputValue(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Change an upcoming session's time or length (booked players keep their seats and are told). */
export function RescheduleSessionForm({ sessionId, startsAt, duration, booked }: { sessionId: number; startsAt: string; duration: number; booked: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(rescheduleSessionAction, undefined);
  // The current time is shown in the GM's own timezone, which the server doesn't know.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const startsErr = state?.fieldErrors?.startsAt;
  const id = `move-${sessionId}`;
  const lengths = [120, 180, 240, 300, 360].includes(duration) ? [120, 180, 240, 300, 360] : [...[120, 180, 240, 300, 360], duration].sort((a, b) => a - b);
  return (
    <form
      action={(f) => {
        f.set("tzOffset", String(new Date(String(f.get("startsAt"))).getTimezoneOffset()));
        return action(f);
      }}
      className="mt-2 space-y-2 sm:w-80"
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <div>
        <label htmlFor={`${id}-at`} className="label">{t("manage.newTime")}</label>
        <input
          key={mounted ? "local" : "server"}
          id={`${id}-at`}
          {...errAttrs(`${id}-at`, startsErr && t(startsErr))}
          name="startsAt"
          type="datetime-local"
          required
          className="input"
          defaultValue={state?.values?.startsAt ?? (mounted ? localInputValue(startsAt) : "")}
        />
        <FieldError id={`${id}-at`} msg={startsErr && t(startsErr)} />
      </div>
      <div>
        <label htmlFor={`${id}-len`} className="label">{t("manage.length")}</label>
        <select id={`${id}-len`} name="duration" defaultValue={state?.values?.duration ?? String(duration)} className="input">
          {lengths.map((m) => (
            <option key={m} value={m}>{t("common.hours", { n: m / 60 })}</option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted">{booked > 0 ? t("manage.moveHint", { n: booked }) : t("manage.moveHintEmpty")}</p>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary py-1.5!" pendingText={t("manage.moving")}><Icon name="calendar-clock" /> {t("manage.moveButton")}</SubmitButton>
    </form>
  );
}

export function AddSessionForm({ gameId }: { gameId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(addSessionAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const startsErr = state?.fieldErrors?.startsAt;
  return (
    <form
      ref={ref}
      action={(f) => {
        // Send the GM's timezone offset so their wall-clock time is converted to UTC correctly.
        f.set("tzOffset", String(new Date(String(f.get("startsAt"))).getTimezoneOffset()));
        return action(f);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="gameId" value={gameId} />
      <div>
        <label htmlFor="startsAt" className="label">{t("manage.dateTime")}</label>
        <input id="startsAt" {...errAttrs("startsAt", startsErr)} name="startsAt" type="datetime-local" required className="input" defaultValue={state?.values?.startsAt} />
      </div>
      <div>
        <label htmlFor="duration" className="label">{t("manage.length")}</label>
        <select id="duration" name="duration" defaultValue={state?.values?.duration ?? "180"} className="input">
          {[120, 180, 240, 300, 360].map((m) => (
            <option key={m} value={m}>{t("common.hours", { n: m / 60 })}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="repeat" className="label">{t("manage.repeat")}</label>
        <select id="repeat" name="repeat" defaultValue="1" className="input">
          <option value="1">{t("manage.repeatOnce")}</option>
          {[2, 3, 4, 6, 8, 10, 12].map((n) => (
            <option key={n} value={n}>{t("manage.repeatWeeks", { n })}</option>
          ))}
        </select>
      </div>
      <SubmitButton pendingText={t("manage.adding")}><Icon name="calendar-plus" /> {t("manage.addSession")}</SubmitButton>
      <div className="w-full">
        <FieldError id="startsAt" msg={startsErr && t(startsErr)} />
        {state?.ok && <p className="text-xs text-success" role="status">{Number(state.values?.added ?? 1) > 1 ? t("manage.sessionsAdded", { n: Number(state.values?.added) }) : t("manage.sessionAdded")}</p>}
      </div>
    </form>
  );
}
