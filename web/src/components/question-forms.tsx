"use client";

import { useActionState, useEffect, useRef } from "react";
import { askQuestionAction, replyQuestionAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

/** The first question about a game (opens the private thread). */
export function AskQuestionForm({ gameId }: { gameId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(askQuestionAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="gameId" value={gameId} />
      <label htmlFor="ask-body" className="label">{t("ask.label")}</label>
      <textarea id="ask-body" name="body" rows={5} maxLength={1000} required className="input" placeholder={t("ask.placeholder")} defaultValue={state?.values?.body} />
      {state?.error && <p className="text-sm text-danger" role="alert">{t(state.error)}</p>}
      <SubmitButton pendingText={t("chat.sending")}><Icon name="paper-plane" /> {t("ask.send")}</SubmitButton>
    </form>
  );
}

/** A reply in a question thread (either side). */
export function QuestionReplyForm({ questionId }: { questionId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(replyQuestionAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="questionId" value={questionId} />
      <label htmlFor="q-reply" className="sr-only">{t("chat.message")}</label>
      <textarea id="q-reply" name="body" rows={2} maxLength={1000} required className="input" placeholder={t("questions.replyPh")} defaultValue={state?.ok ? "" : state?.values?.body} />
      <SubmitButton pendingText={t("chat.sending")}><Icon name="paper-plane" /> {t("chat.send")}</SubmitButton>
      {state?.error && <p className="text-xs text-danger" role="alert">{t(state.error)}</p>}
    </form>
  );
}
