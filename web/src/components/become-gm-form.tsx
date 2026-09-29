"use client";

import { useActionState, useState } from "react";
import { becomeGmAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";
import { PortraitPicker } from "./portrait-picker";

/** "Online" first, then major Indonesian cities. GMs can type any city. */
const LOCATION_SUGGESTIONS = ["Online", "Jakarta", "Bandung", "Surabaya", "Yogyakarta", "Semarang", "Malang", "Bali", "Medan", "Makassar"];

type Defaults = {
  headline: string; systems: string; years: number; location: string; bio: string; paymentInfo: string;
  /** "" = initials avatar; otherwise a library portrait or the GM's current one. */
  avatarImage: string; name: string; hue: number;
};

export function BecomeGmForm({ defaults }: { defaults: Defaults }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(becomeGmAction, undefined);
  const fe = state?.fieldErrors ?? {};
  // After a failed save, refill from what was submitted (React resets the form).
  const v = state?.values;
  const val = (k: string, fallback: string | number) => v?.[k] ?? String(fallback);
  const [portrait, setPortrait] = useState(v?.avatarImage ?? defaults.avatarImage);
  return (
    <form action={action} className="space-y-4">
      <PortraitPicker
        name={defaults.name}
        hue={defaults.hue}
        current={defaults.avatarImage}
        value={portrait}
        onChange={setPortrait}
        error={fe.avatarImage && t(fe.avatarImage)}
      />
      <div>
        <label htmlFor="headline" className="label">{t("becomeGm.headline")}</label>
        <input id="headline" {...errAttrs("headline", fe.headline)} name="headline" defaultValue={val("headline", defaults.headline)} maxLength={100} className="input" placeholder={t("becomeGm.headlinePh")} />
        <FieldError id="headline" msg={fe.headline && t(fe.headline)} />
      </div>
      <div>
        <label htmlFor="systems" className="label">{t("becomeGm.systems")}</label>
        <input id="systems" name="systems" defaultValue={val("systems", defaults.systems)} className="input" placeholder="D&D 5e, Call of Cthulhu" />
        <p className="mt-1 text-xs text-muted">{t("common.commaSeparated")}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="years" className="label">{t("becomeGm.years")}</label>
          <input id="years" name="years" type="number" min={0} max={60} defaultValue={val("years", defaults.years)} className="input" />
        </div>
        <div>
          <label htmlFor="location" className="label flex items-center gap-1.5"><Icon name="marker" className="text-muted" /> {t("profile.location")}</label>
          <input id="location" name="location" list="gm-locations" defaultValue={val("location", defaults.location)} maxLength={60} className="input" placeholder={t("becomeGm.locationPh")} />
          <datalist id="gm-locations">
            {LOCATION_SUGGESTIONS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">{t("becomeGm.locationHint")}</p>
      <div>
        <label htmlFor="bio" className="label">{t("becomeGm.bio")}</label>
        <textarea id="bio" {...errAttrs("bio", fe.bio)} name="bio" rows={5} defaultValue={val("bio", defaults.bio)} className="input" placeholder={t("becomeGm.bioPh")} />
        <FieldError id="bio" msg={fe.bio && t(fe.bio)} />
      </div>
      <div>
        <label htmlFor="paymentInfo" className="label flex items-center gap-1.5"><Icon name="wallet" className="text-accent" /> {t("becomeGm.payment")}</label>
        <textarea id="paymentInfo" name="paymentInfo" rows={3} maxLength={500} defaultValue={val("paymentInfo", defaults.paymentInfo)} className="input" placeholder={t("becomeGm.paymentPh")} />
        <p className="mt-1 text-xs text-muted">{t("becomeGm.paymentHint")}</p>
      </div>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary w-full" pendingText={t("common.saving")}>{t("becomeGm.save")}</SubmitButton>
    </form>
  );
}
