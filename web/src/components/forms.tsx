"use client";

import { useActionState, useEffect, useRef } from "react";
import { postMessageAction, submitReviewAction, addSessionAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

export function ReviewForm({ gameId }: { gameId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(submitReviewAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="card space-y-3 p-5">
      <input type="hidden" name="gameId" value={gameId} />
      <h3 className="font-semibold">{t("reviews.formTitle")}</h3>
      <fieldset {...errAttrs("rating", fe.rating)}>
        <legend className="sr-only">{t("reviews.rating")}</legend>
        <div className="flex flex-row-reverse justify-end gap-1">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="rating" value={n} className="peer sr-only" required defaultChecked={state?.values?.rating === String(n)} />
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
      <FieldError id="rating" msg={fe.rating && t(fe.rating)} />
      <label htmlFor="review-body" className="sr-only">{t("reviews.review")}</label>
      <textarea id="review-body" {...errAttrs("review-body", fe.body)} name="body" rows={3} className="input" placeholder={t("reviews.placeholder")} defaultValue={state?.values?.body} />
      <FieldError id="review-body" msg={fe.body && t(fe.body)} />
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("reviews.posting")}>{t("reviews.post")}</SubmitButton>
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
      <SubmitButton pendingText={t("manage.adding")}><Icon name="calendar-plus" /> {t("manage.addSession")}</SubmitButton>
      <div className="w-full">
        <FieldError id="startsAt" msg={startsErr && t(startsErr)} />
        {state?.ok && <p className="text-xs text-success">{t("manage.sessionAdded")}</p>}
      </div>
    </form>
  );
}
