"use client";

import { useActionState, useState } from "react";
import { saveGameAction, type FormState } from "@/app/actions";
import { SubmitButton } from "./submit-button";
import { FieldError, Notice, errAttrs } from "./ui";
import { useI18n } from "./i18n-provider";
import { ImageChoiceGrid } from "./image-choice";
import { Icon } from "./icon";
import type { RegularIcon } from "@/lib/icons";
import { GENRES, MAX_PER_GAME, STYLES, genreIcon, genreLabelKey, parseCategoryCsv, styleIcon, styleLabelKey } from "@/lib/categories";
import { COVER_LIBRARY, libraryCoverPath } from "@/lib/placeholders";
import type { MsgKey } from "@/lib/i18n/dict";

export type GameFormDefaults = {
  id?: number;
  title: string;
  system: string;
  summary: string;
  description: string;
  format: string;
  locationType: string;
  language: string;
  platform: string;
  city: string;
  price: string;
  seatsTotal: string;
  experienceLevel: string;
  minAge: string;
  contentWarnings: string;
  safetyTools: string;
  tags: string;
  coverHue: number;
  /** "" = generated gradient; otherwise a library path or the game's current art. */
  coverImage: string;
  /** CSV of category keys (lib/categories.ts). */
  genres: string;
  styles: string;
  status: string;
};

export const EMPTY_GAME: GameFormDefaults = {
  title: "", system: "", summary: "", description: "", format: "one_shot", locationType: "online", language: "id", platform: "", city: "",
  price: "50.000", seatsTotal: "5", experienceLevel: "any", minAge: "18", contentWarnings: "", safetyTools: "Session zero, lines & veils, X-card",
  tags: "", coverHue: 260, coverImage: "", genres: "", styles: "", status: "published",
};

export function GameForm({ defaults: initial, systems }: { defaults: GameFormDefaults; systems: readonly string[] }) {
  const { t } = useI18n();
  const [state, action] = useActionState<FormState, FormData>(saveGameAction, undefined);
  // After a failed save, refill every field from what was submitted (React resets the form).
  const defaults: GameFormDefaults = { ...initial, ...(state?.values as Partial<GameFormDefaults> | undefined), coverHue: initial.coverHue, id: initial.id };
  const [location, setLocation] = useState(defaults.locationType);
  const [hue, setHue] = useState(defaults.coverHue);
  const [cover, setCover] = useState(defaults.coverImage);
  const fe = state?.fieldErrors ?? {};
  const err = (k: string) => (fe[k] ? t(fe[k]) : undefined);

  return (
    <form action={action} className="space-y-8" noValidate>
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

      <Fieldset title={t("gameForm.basics")}>
        <Field id="title" label={t("gameForm.title")} error={err("title")}>
          <input id="title" {...errAttrs("title", err("title"))} name="title" defaultValue={defaults.title} maxLength={80} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="system" label={t("browse.system")} error={err("system")}>
            <input id="system" {...errAttrs("system", err("system"))} name="system" list="systems" defaultValue={defaults.system} className="input" placeholder={t("gameForm.systemPh")} />
            <datalist id="systems">{systems.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field id="format" label={t("browse.format")}>
            <select id="format" name="format" defaultValue={defaults.format} className="input">
              <option value="one_shot">{t("format.one_shot")}</option>
              <option value="campaign">{t("format.campaign")}</option>
            </select>
          </Field>
        </div>
        <Field id="summary" label={t("gameForm.summary")} error={err("summary")} hint={t("gameForm.summaryHint")}>
          <input id="summary" {...errAttrs("summary", err("summary"))} name="summary" defaultValue={defaults.summary} maxLength={160} className="input" />
        </Field>
        <Field id="description" label={t("gameForm.description")} error={err("description")}>
          <textarea id="description" {...errAttrs("description", err("description"))} name="description" rows={8} defaultValue={defaults.description} className="input" />
        </Field>
        <Field id="tags" label={t("gameForm.tags")} hint={t("gameForm.tagsHint")}>
          <input id="tags" name="tags" defaultValue={defaults.tags} className="input" />
        </Field>
      </Fieldset>

      <Fieldset title={t("gameForm.categories")}>
        <p className="-mt-2 text-xs text-muted">{t("gameForm.categoriesHint", { n: MAX_PER_GAME })}</p>
        <CategoryChips
          name="genres"
          legend={t("browse.genre")}
          initial={parseCategoryCsv(defaults.genres)}
          options={GENRES.map((g) => ({ key: g.key, label: t(genreLabelKey(g.key)), icon: genreIcon(g.key) }))}
        />
        <CategoryChips
          name="styles"
          legend={t("browse.style")}
          initial={parseCategoryCsv(defaults.styles)}
          options={STYLES.map((s) => ({ key: s.key, label: t(styleLabelKey(s.key)), icon: styleIcon(s.key) }))}
        />
      </Fieldset>

      <Fieldset title={t("gameForm.whereWho")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="locationType" label={t("gameForm.location")}>
            <select id="locationType" name="locationType" value={location} onChange={(e) => setLocation(e.target.value)} className="input">
              <option value="online">{t("loc.online")}</option>
              <option value="in_person">{t("loc.inPerson")}</option>
            </select>
          </Field>
          {location === "online" ? (
            <Field id="platform" label={t("gameForm.platform")} error={err("platform")}>
              <input id="platform" {...errAttrs("platform", err("platform"))} name="platform" defaultValue={defaults.platform} className="input" placeholder="Discord + Foundry VTT" />
            </Field>
          ) : (
            <Field id="city" label={t("gameForm.city")} error={err("city")}>
              <input id="city" {...errAttrs("city", err("city"))} name="city" defaultValue={defaults.city} className="input" placeholder="Jakarta" />
            </Field>
          )}
        </div>
        <Field id="language" label={t("gameForm.language")}>
          <select id="language" name="language" defaultValue={defaults.language} className="input max-w-72">
            <option value="id">{t("lang.gameId")}</option>
            <option value="en">{t("lang.gameEn")}</option>
            <option value="both">{t("lang.gameBoth")}</option>
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="experienceLevel" label={t("browse.experience")}>
            <select id="experienceLevel" name="experienceLevel" defaultValue={defaults.experienceLevel} className="input">
              <option value="any">{t("level.any")}</option>
              <option value="beginner">{t("level.beginner")}</option>
              <option value="experienced">{t("level.experienced")}</option>
            </select>
          </Field>
          <Field id="minAge" label={t("gameForm.minAge")} error={err("minAge")}>
            <input id="minAge" {...errAttrs("minAge", err("minAge"))} name="minAge" type="number" min={0} max={99} defaultValue={defaults.minAge} className="input" />
          </Field>
          <Field id="seatsTotal" label={t("gameForm.seats")} error={err("seatsTotal")}>
            <input id="seatsTotal" {...errAttrs("seatsTotal", err("seatsTotal"))} name="seatsTotal" type="number" min={1} max={12} defaultValue={defaults.seatsTotal} className="input" />
          </Field>
        </div>
      </Fieldset>

      <Fieldset title={t("gameForm.priceTitle")}>
        <Field id="price" label={t("gameForm.price")} error={err("price")} hint={t("gameForm.priceHint")}>
          <div className="relative max-w-56">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">Rp</span>
            <input id="price" {...errAttrs("price", err("price"))} name="price" inputMode="numeric" defaultValue={defaults.price} className="input pl-9!" />
          </div>
        </Field>
      </Fieldset>

      <Fieldset title={t("gameForm.safetyTitle")}>
        <Field id="safetyTools" label={t("game.safety")}>
          <input id="safetyTools" name="safetyTools" defaultValue={defaults.safetyTools} className="input" />
        </Field>
        <Field id="contentWarnings" label={t("game.cw")} hint={t("gameForm.cwHint")}>
          <input id="contentWarnings" name="contentWarnings" defaultValue={defaults.contentWarnings} className="input" />
        </Field>
      </Fieldset>

      <Fieldset title={t("gameForm.appearance")}>
        <CoverPicker
          value={cover}
          onChange={setCover}
          current={initial.coverImage}
          hue={hue}
          error={err("coverImage")}
        />
        <Field id="coverHue" label={t("gameForm.gradientColour")} hint={t("gameForm.gradientHint")}>
          <div className="flex items-center gap-3">
            <input id="coverHue" name="coverHue" type="range" min={0} max={359} value={hue} onChange={(e) => setHue(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
            <span aria-hidden className="h-10 w-16 rounded-md" style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 50%), hsl(${(hue + 40) % 360} 50% 25%))` }} />
          </div>
        </Field>
        <Field id="status" label={t("gameForm.visibility")}>
          <select id="status" name="status" defaultValue={defaults.status === "draft" ? "draft" : "published"} className="input max-w-80">
            <option value="published">{t("gameForm.published")}</option>
            <option value="draft">{t("gameForm.draft")}</option>
          </select>
        </Field>
      </Fieldset>

      {state?.error && <Notice tone="danger">{t(state.error)}</Notice>}
      <SubmitButton pendingText={t("common.saving")}>{defaults.id ? t("gameForm.saveChanges") : t("gameForm.create")}</SubmitButton>
    </form>
  );
}

/** Cover choices: gradient, the game's current art (if not from the library), library illustrations. */
function CoverPicker({ value, onChange, current, hue, error }: {
  value: string; onChange: (v: string) => void; current: string; hue: number; error?: string;
}) {
  const { t } = useI18n();
  const library = COVER_LIBRARY.map((c) => ({ value: libraryCoverPath(c.motif), label: t(`cover.${c.motif}` as MsgKey) }));
  const options = [
    { value: "", label: t("gameForm.coverGradient") },
    ...(current && !library.some((o) => o.value === current) ? [{ value: current, label: t("gameForm.coverCurrent") }] : []),
    ...library,
  ];
  return (
    <ImageChoiceGrid
      name="coverImage"
      legend={t("gameForm.cover")}
      hint={t("gameForm.coverHint")}
      options={options}
      value={value}
      onChange={onChange}
      shape="wide"
      error={error}
      fallback={<span className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 50%), hsl(${(hue + 40) % 360} 50% 25%))` }} />}
    />
  );
}

/** Checkbox chips capped at MAX_PER_GAME: extra choices are disabled until one is unticked. */
function CategoryChips({ name, legend, options, initial }: {
  name: string; legend: string; initial: string[];
  options: { key: string; label: string; icon: RegularIcon }[];
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const full = picked.length >= MAX_PER_GAME;
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = picked.includes(o.key);
          return (
            <label key={o.key} className={on || !full ? "cursor-pointer" : "cursor-not-allowed opacity-50"}>
              <input
                type="checkbox"
                name={name}
                value={o.key}
                checked={on}
                disabled={!on && full}
                onChange={() => setPicked((p) => (on ? p.filter((k) => k !== o.key) : [...p, o.key]))}
                className="peer sr-only"
              />
              <span className="chip gap-1 py-1! peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                <Icon name={on ? "check" : o.icon} /> {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card space-y-4 p-5">
      <legend className="px-1 text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>{title}</legend>
      {children}
    </fieldset>
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
