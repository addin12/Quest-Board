"use client";

import { ImageChoiceGrid } from "./image-choice";
import { Avatar, initialsOf } from "./ui";
import { useI18n } from "./i18n-provider";
import { PORTRAIT_LIBRARY, libraryPortraitPath } from "@/lib/placeholders";

/**
 * Profile-picture picker (players and GMs): Initials → current portrait (if it
 * isn't a library one, e.g. seeded demo art) → the 12 library portraits.
 * Posts the choice as `avatarImage`; the server allow-lists it.
 */
export function PortraitPicker({
  name,
  hue,
  current,
  value,
  onChange,
  error,
}: {
  name: string;
  hue: number;
  current: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const { t } = useI18n();
  const library = PORTRAIT_LIBRARY.map((p, i) => ({ value: libraryPortraitPath(p.key), label: t("becomeGm.portraitN", { n: i + 1 }) }));
  const options = [
    { value: "", label: t("becomeGm.portraitInitials") },
    ...(current && !library.some((o) => o.value === current) ? [{ value: current, label: t("becomeGm.portraitCurrent") }] : []),
    ...library,
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-2 p-3">
        <Avatar name={name} hue={hue} image={value} size={64} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-xs text-muted">{t("becomeGm.portraitPreview")}</p>
        </div>
      </div>
      <ImageChoiceGrid
        name="avatarImage"
        legend={t("becomeGm.portrait")}
        hint={t("becomeGm.portraitHint")}
        options={options}
        value={value}
        onChange={onChange}
        shape="round"
        error={error}
        fallback={
          // Fills the round tile at any size (the fixed-size Avatar would overflow it).
          <span
            className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white sm:text-xl"
            style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 40) % 360} 60% 32%))` }}
          >
            {initialsOf(name)}
          </span>
        }
      />
    </div>
  );
}
