"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createNoticeAction, replyNoticeAction, type FormState } from "@/app/actions";
import { MAX_SPOTS } from "@/lib/board";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { Icon } from "./icon";
import { useI18n } from "./i18n-provider";

export function NoticeForm({ systems }: { systems: readonly string[] }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(createNoticeAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => (fe[k] ? t(fe[k]) : undefined);
  const [kind, setKind] = useState(v?.kind ?? "lf_group");
  const [location, setLocation] = useState(v?.locationType ?? "online");
  return (
    <form action={action} className="space-y-5" noValidate>
      <fieldset {...errAttrs("kind", err("kind"))}>
        <legend className="label">{t("board.kindLabel")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["lf_group", "lf_players"] as const).map((k) => (
            <label key={k} className="card flex cursor-pointer items-start gap-3 p-3 has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent/30">
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1 accent-[var(--accent)]" />
              <span>
                <span className="block font-semibold">{t(k === "lf_group" ? "board.kindGroup" : "board.kindPlayers")}</span>
                <span className="block text-xs text-muted">{t(k === "lf_group" ? "board.kindGroupHint" : "board.kindPlayersHint")}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="kind" msg={err("kind")} />
      </fieldset>

      <Field id="title" label={t("board.title")} error={err("title")} hint={t("board.titleHint")}>
        <input id="title" {...errAttrs("title", err("title"))} name="title" maxLength={80} defaultValue={v?.title} className="input" placeholder={t("board.titlePh")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="system" label={t("browse.system")} hint={t("hire.systemHint")}>
          <input id="system" name="system" list="board-systems" maxLength={60} defaultValue={v?.system} className="input" />
          <datalist id="board-systems">{systems.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        {kind === "lf_players" && (
          <Field id="spots" label={t("board.spotsLabel")} error={err("spots")}>
            <input id="spots" {...errAttrs("spots", err("spots"))} name="spots" type="number" min={1} max={MAX_SPOTS} defaultValue={v?.spots ?? "2"} className="input" />
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="language" label={t("browse.language")}>
          <select id="language" name="language" defaultValue={v?.language ?? "id"} className="input">
            <option value="id">{t("lang.gameId")}</option>
            <option value="en">{t("lang.gameEn")}</option>
            <option value="both">{t("lang.gameBoth")}</option>
          </select>
        </Field>
        <Field id="locationType" label={t("gameForm.location")}>
          <select id="locationType" name="locationType" value={location} onChange={(e) => setLocation(e.target.value)} className="input">
            <option value="online">{t("loc.online")}</option>
            <option value="in_person">{t("loc.inPerson")}</option>
          </select>
        </Field>
        {location === "in_person" && (
          <Field id="city" label={t("gameForm.city")} error={err("city")}>
            <input id="city" {...errAttrs("city", err("city"))} name="city" maxLength={60} defaultValue={v?.city} className="input" placeholder="Bandung" />
          </Field>
        )}
      </div>
      <Field id="schedule" label={t("hire.schedule")} error={err("schedule")}>
        <input id="schedule" {...errAttrs("schedule", err("schedule"))} name="schedule" maxLength={200} defaultValue={v?.schedule} className="input" placeholder={t("hire.schedulePh")} />
      </Field>
      <Field id="body" label={t("board.body")} error={err("body")}>
        <textarea id="body" {...errAttrs("body", err("body"))} name="body" rows={5} maxLength={1000} defaultValue={v?.body} className="input" placeholder={t("board.bodyPh")} />
      </Field>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("hire.sending")}><Icon name="thumbtack" /> {t("board.pin")}</SubmitButton>
    </form>
  );
}

export function ReplyForm({ postId }: { postId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(replyNoticeAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const fe = state?.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="postId" value={postId} />
      <label htmlFor="reply-body" className="label">{t("board.replyLabel")}</label>
      <textarea id="reply-body" {...errAttrs("reply-body", fe.body && t(fe.body))} name="body" rows={3} maxLength={1000} className="input" placeholder={t("board.replyPh")} defaultValue={state?.ok ? "" : state?.values?.body} />
      <FieldError id="reply-body" msg={fe.body && t(fe.body)} />
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("hire.sending")}><Icon name="comment" /> {t("board.reply")}</SubmitButton>
    </form>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error ? <FieldError id={id} msg={error} /> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
