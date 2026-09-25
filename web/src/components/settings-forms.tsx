"use client";

import { useActionState, useState } from "react";
import { changePasswordAction, updateProfileAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { PortraitPicker } from "./portrait-picker";
import { Icon } from "./icon";

type ProfileDefaults = { name: string; email: string; bio: string; hue: number; avatarImage: string };

/** Display name, profile picture, bio and UI language — for players and GMs. */
export function ProfileSettingsForm({ defaults }: { defaults: ProfileDefaults }) {
  const { t, lang } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, undefined);
  const v = state?.values;
  const fe = state?.fieldErrors ?? {};
  const [portrait, setPortrait] = useState(v?.avatarImage ?? defaults.avatarImage);
  const [name, setName] = useState(v?.name ?? defaults.name);
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
