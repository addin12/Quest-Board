"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createGmRequestAction, postRequestMessageAction, sendOfferAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

/** "Request a GM for your group": open to all GMs, or direct to one (`gm`). */
export function GmRequestForm({ systems, gm }: { systems: readonly string[]; gm?: { id: number; name: string } }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(createGmRequestAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => (fe[k] ? t(fe[k]) : undefined);
  const [location, setLocation] = useState(v?.locationType ?? "online");
  return (
    <form action={action} className="space-y-5" noValidate>
      {gm && <input type="hidden" name="gmId" value={gm.id} />}
      {gm && <Notice>{t("hire.directTo", { name: gm.name })}</Notice>}
      <Field id="title" label={t("hire.requestTitle")} error={err("title")} hint={t("hire.requestTitleHint")}>
        <input id="title" {...errAttrs("title", err("title"))} name="title" maxLength={80} defaultValue={v?.title} className="input" placeholder={t("hire.requestTitlePh")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="system" label={t("browse.system")} hint={t("hire.systemHint")}>
          <input id="system" name="system" list="req-systems" maxLength={60} defaultValue={v?.system} className="input" placeholder="D&D 5.5e (2024)" />
          <datalist id="req-systems">{systems.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field id="groupSize" label={t("hire.groupSize")} error={err("groupSize")}>
          <input id="groupSize" {...errAttrs("groupSize", err("groupSize"))} name="groupSize" type="number" min={1} max={12} defaultValue={v?.groupSize ?? "4"} className="input" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="experienceLevel" label={t("browse.experience")}>
          <select id="experienceLevel" name="experienceLevel" defaultValue={v?.experienceLevel ?? "any"} className="input">
            <option value="any">{t("level.any")}</option>
            <option value="beginner">{t("level.beginner")}</option>
            <option value="experienced">{t("level.experienced")}</option>
          </select>
        </Field>
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
      </div>
      {location === "in_person" && (
        <Field id="city" label={t("gameForm.city")} error={err("city")}>
          <input id="city" {...errAttrs("city", err("city"))} name="city" maxLength={60} defaultValue={v?.city} className="input" placeholder="Jakarta" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="schedule" label={t("hire.schedule")} error={err("schedule")}>
          <input id="schedule" {...errAttrs("schedule", err("schedule"))} name="schedule" maxLength={200} defaultValue={v?.schedule} className="input" placeholder={t("hire.schedulePh")} />
        </Field>
        <Field id="budget" label={t("hire.budget")} error={err("budget")} hint={t("hire.budgetHint")}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">Rp</span>
            <input id="budget" {...errAttrs("budget", err("budget"))} name="budget" inputMode="numeric" defaultValue={v?.budget} className="input pl-9!" placeholder="75.000" />
          </div>
        </Field>
      </div>
      <Field id="details" label={t("hire.details")} error={err("details")}>
        <textarea id="details" {...errAttrs("details", err("details"))} name="details" rows={5} maxLength={2000} defaultValue={v?.details} className="input" placeholder={t("hire.detailsPh")} />
      </Field>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("hire.sending")}><Icon name="paper-plane" /> {t("hire.submitRequest")}</SubmitButton>
    </form>
  );
}

/** A GM's offer on an open request. */
export function OfferForm({ requestId }: { requestId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(sendOfferAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  if (state?.ok) return <Notice tone="success">{t("hire.offerSent")}</Notice>;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="requestId" value={requestId} />
      <Field id="message" label={t("hire.offerMessage")} error={fe.message && t(fe.message)}>
        <textarea id="message" {...errAttrs("message", fe.message && t(fe.message))} name="message" rows={4} maxLength={1000} defaultValue={v?.message} className="input" placeholder={t("hire.offerMessagePh")} />
      </Field>
      <Field id="price" label={t("hire.offerPrice")} error={fe.price && t(fe.price)} hint={t("gameForm.priceHint")}>
        <div className="relative max-w-56">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">Rp</span>
          <input id="price" {...errAttrs("price", fe.price && t(fe.price))} name="price" inputMode="numeric" defaultValue={v?.price} className="input pl-9!" placeholder="75.000" />
        </div>
      </Field>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("hire.sending")}><Icon name="hand-wave" /> {t("hire.sendOffer")}</SubmitButton>
    </form>
  );
}

/** Private requester ↔ chosen-GM thread. */
export function RequestMessageForm({ requestId }: { requestId: number }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(postRequestMessageAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor="thread-msg" className="sr-only">{t("chat.message")}</label>
      <textarea id="thread-msg" name="body" rows={2} maxLength={1000} required className="input" placeholder={t("hire.threadPh")} defaultValue={state?.ok ? "" : state?.values?.body} />
      <SubmitButton pendingText={t("chat.sending")}><Icon name="paper-plane" /> {t("chat.send")}</SubmitButton>
      {state?.error && <p className="text-xs text-danger">{t(state.error)}</p>}
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
