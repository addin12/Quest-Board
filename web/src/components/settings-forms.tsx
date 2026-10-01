"use client";

import { useActionState, useState } from "react";
import { changePasswordAction, requestEmailChangeAction, updateProfileAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { PortraitPicker } from "./portrait-picker";
import { useBrowserTimeZone } from "./forms";
import { INDONESIAN_ZONES } from "@/lib/time-zones";
import { Icon } from "./icon";

type ProfileDefaults = { name: string; email: string; bio: string; hue: number; avatarImage: string; emailReminders: boolean; emailNotifications: boolean; timeZone: string };

/** Display name, profile picture, bio and UI language — for players and GMs. */
export function ProfileSettingsForm({ defaults }: { defaults: ProfileDefaults }) {
  const { t, lang } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  const [portrait, setPortrait] = useState(v?.avatarImage ?? defaults.avatarImage);
  const [name, setName] = useState(v?.name ?? defaults.name);
  const browserZone = useBrowserTimeZone();
  return (
    <form action={action} className="space-y-5">
      <PortraitPicker
        name={name || defaults.name}
        hue={defaults.hue}
        current={defaults.avatarImage}
        value={portrait}
        onChange={setPortrait}
        error={fe.avatarImage && t(fe.avatarImage)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">{t("auth.displayName")}</label>
          <input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} className="input" {...errAttrs("name", fe.name)} />
          <FieldError id="name" msg={fe.name && t(fe.name)} />
        </div>
        <div>
          <label htmlFor="email" className="label">{t("auth.email")}</label>
          <input id="email" value={defaults.email} readOnly disabled className="input opacity-70" />
          <p className="mt-1 text-xs text-muted">{t("settings.emailHint")}</p>
        </div>
      </div>
      <div>
        <label htmlFor="bio" className="label">{t("settings.bio")}</label>
        <textarea id="bio" {...errAttrs("bio", fe.bio)} name="bio" rows={4} maxLength={2000} defaultValue={v?.bio ?? defaults.bio} className="input" placeholder={t("settings.bioPh")} />
        <FieldError id="bio" msg={fe.bio && t(fe.bio)} />
      </div>
      <div>
        <label htmlFor="language" className="label flex items-center gap-1.5"><Icon name="globe" className="text-muted" /> {t("lang.switch")}</label>
        <select id="language" name="language" defaultValue={v?.language ?? lang} className="input max-w-60">
          <option value="en">English</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
      </div>
      <div>
        <label htmlFor="timeZone" className="label">{t("settings.timeZone")}</label>
        <select id="timeZone" name="timeZone" defaultValue={v?.timeZone ?? defaults.timeZone} className="input max-w-full sm:max-w-md" aria-describedby="timeZone-hint">
          {INDONESIAN_ZONES.map((z) => <option key={z.tz} value={z.tz}>{t(`tz.${z.label.toLowerCase() as "wib" | "wita" | "wit"}`)}</option>)}
          {[defaults.timeZone, browserZone].filter((z, i, all) => z && !INDONESIAN_ZONES.some((x) => x.tz === z) && all.indexOf(z) === i).map((z) => (
            <option key={z} value={z}>{z === browserZone ? t("tz.device", { zone: z }) : z}</option>
          ))}
        </select>
        <p id="timeZone-hint" className="mt-1 text-xs text-muted">{t("settings.timeZoneHint")}</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="emailReminders" value="1" defaultChecked={v ? v.emailReminders === "1" : defaults.emailReminders} className="mt-1 accent-[var(--accent)]" />
        <span><Icon name="calendar-clock" className="mr-1 text-muted" />{t("settings.emailReminders")}</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="emailNotifications" value="1" defaultChecked={v ? v.emailNotifications === "1" : defaults.emailNotifications} className="mt-1 accent-[var(--accent)]" />
        <span><Icon name="envelope" className="mr-1 text-muted" />{t("settings.emailNotifications")}</span>
      </label>
      {state?.ok && <Notice tone="success">{t("settings.saved")}</Notice>}
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("common.saving")}><Icon name="check" /> {t("settings.save")}</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="currentPassword" className="label">{t("settings.currentPassword")}</label>
          <input id="currentPassword" {...errAttrs("currentPassword", fe.currentPassword)} name="currentPassword" type="password" autoComplete="current-password" required className="input" />
          <FieldError id="currentPassword" msg={fe.currentPassword && t(fe.currentPassword)} />
        </div>
        <div>
          <label htmlFor="newPassword" className="label">{t("settings.newPassword")}</label>
          <input id="newPassword" {...errAttrs("newPassword", fe.newPassword)} name="newPassword" type="password" autoComplete="new-password" minLength={8} required className="input" />
          {fe.newPassword ? <FieldError id="newPassword" msg={t(fe.newPassword)} /> : <p className="mt-1 text-xs text-muted">{t("auth.passwordHint")}</p>}
        </div>
      </div>
      {state?.ok && <Notice tone="success">{t("settings.passwordChanged")}</Notice>}
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-secondary" pendingText={t("common.saving")}><Icon name="key" /> {t("settings.changePassword")}</SubmitButton>
    </form>
  );
}

/** Change the login email: the new address gets a link; nothing changes until it's opened. */
export function EmailChangeForm({ pending }: { pending: string | null }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(requestEmailChangeAction, undefined);
  const fe = state?.fieldErrors ?? {};
  const waitingFor = state?.ok ? state.values?.newEmail ?? null : pending;
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">{t("settings.loginEmailLead")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="newEmail" className="label">{t("settings.newEmail")}</label>
          <input id="newEmail" {...errAttrs("newEmail", fe.newEmail)} name="newEmail" type="email" autoComplete="email" required defaultValue={state?.values?.newEmail} className="input" />
          <FieldError id="newEmail" msg={fe.newEmail && t(fe.newEmail)} />
        </div>
        <div>
          <label htmlFor="emailPassword" className="label">{t("settings.emailPassword")}</label>
          <input id="emailPassword" {...errAttrs("emailPassword", fe.emailPassword)} name="currentPassword" type="password" autoComplete="current-password" required className="input" />
          <FieldError id="emailPassword" msg={fe.emailPassword && t(fe.emailPassword)} />
        </div>
      </div>
      {state?.ok && waitingFor ? <Notice tone="success">{t("settings.emailChangeSent", { email: waitingFor })}</Notice>
        : waitingFor && <Notice tone="info">{t("settings.emailChangePending", { email: waitingFor })}</Notice>}
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-secondary" pendingText={t("common.saving")}><Icon name="envelope" /> {t("settings.changeEmail")}</SubmitButton>
    </form>
  );
}
