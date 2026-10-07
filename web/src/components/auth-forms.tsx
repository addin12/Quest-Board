"use client";

import { BrowserTimeZoneInput } from "./forms";
import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";

export function LoginForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label htmlFor="email" className="label">{t("auth.email")}</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" defaultValue={state?.values?.email} />
      </div>
      <div>
        <label htmlFor="password" className="label">{t("auth.password")}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <p className="-mt-2 text-right text-xs"><Link href="/forgot-password" className="font-semibold text-accent hover:underline">{t("reset.forgot")}</Link></p>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton className="btn-primary w-full" pendingText={t("auth.signingIn")}>{t("nav.login")}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {t("auth.newHere")}{" "}
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent">{t("auth.createAccount")}</Link>
      </p>
    </form>
  );
}

export function SignupForm({ next, defaultRole }: { next?: string; defaultRole?: "player" | "gm" }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(signupAction, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <BrowserTimeZoneInput />
      <fieldset>
        <legend className="label">{t("auth.iWantTo")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            ["player", "dice-d20", "auth.rolePlay", "auth.rolePlayHint"],
            ["gm", "hat-wizard", "auth.roleRun", "auth.roleRunHint"],
          ] as const).map(([v, icon, title, hint]) => (
            <label key={v} className="relative cursor-pointer">
              <input type="radio" name="role" value={v} defaultChecked={(state?.values?.role ?? defaultRole ?? "player") === v} className="peer sr-only" />
              <span className="block rounded-lg border border-border p-3 peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                <Icon name={icon} className="mb-1 text-xl text-accent" />
                <span className="block text-sm font-semibold">{t(title)}</span>
                <span className="block text-xs text-muted">{t(hint)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="name" className="label">{t("auth.displayName")}</label>
        <input id="name" name="name" autoComplete="nickname" required className="input" {...errAttrs("name", fe.name)} defaultValue={state?.values?.name} />
        <FieldError id="name" msg={fe.name && t(fe.name)} />
      </div>
      <div>
        <label htmlFor="email" className="label">{t("auth.email")}</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" {...errAttrs("email", fe.email)} defaultValue={state?.values?.email} />
        <FieldError id="email" msg={fe.email && t(fe.email)} />
      </div>
      <div>
        <label htmlFor="password" className="label">{t("auth.password")}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" {...errAttrs("password", fe.password)} />
        {fe.password ? <FieldError id="password" msg={t(fe.password)} /> : <p className="mt-1 text-xs text-muted">{t("auth.passwordHint")}</p>}
      </div>
      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <p className="text-xs text-muted">
        {t("legal.agreePrefix")} <Link href="/terms" className="font-semibold text-accent underline">{t("legal.terms.title")}</Link> {t("legal.agreeAnd")}{" "}
        <Link href="/privacy" className="font-semibold text-accent underline">{t("legal.privacy.title")}</Link>.
      </p>
      <SubmitButton className="btn-primary w-full" pendingText={t("auth.creating")}>{t("auth.createAccount")}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {t("auth.haveAccount")} <Link href="/login" className="font-semibold text-accent">{t("nav.login")}</Link>
      </p>
    </form>
  );
}
