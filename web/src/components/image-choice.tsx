"use client";

import Image from "next/image";
import { Icon } from "./icon";

export type ImageOption = { value: string; label: string };

/**
 * Accessible radio-group of image tiles (used for game covers and GM portraits).
 * Options with value "" render `fallback` (gradient / initials) instead of an image.
 */
export function ImageChoiceGrid({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  shape,
  fallback,
  error,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: ImageOption[];
  value: string;
  onChange: (v: string) => void;
  shape: "wide" | "round";
  fallback: React.ReactNode;
  error?: string;
}) {
  const round = shape === "round";
  return (
    <fieldset aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="label">{legend}</legend>
      {hint && <p className="-mt-0.5 mb-3 text-xs text-muted">{hint}</p>}
      <div className={round ? "grid grid-cols-4 gap-2 sm:grid-cols-5" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"}>
        {options.map((o) => (
          <label
            key={o.value || "none"}
            title={o.label}
            className="group cursor-pointer rounded-lg border border-border bg-surface p-1.5 transition-colors hover:border-accent has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" aria-label={o.label} />
            <span className={`relative block overflow-hidden ${round ? "mx-auto aspect-square w-full max-w-20 rounded-full" : "aspect-[2/1] rounded-md"}`}>
              {o.value ? <Image src={o.value} alt="" fill sizes={round ? "80px" : "240px"} className="object-cover" /> : fallback}
              {value === o.value && (
                <span className={`absolute flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-accent-ink ${round ? "bottom-0 right-0" : "right-1.5 top-1.5"}`}>
                  <Icon name="check" />
                </span>
              )}
            </span>
            {!round && <span className="mt-1.5 block truncate px-0.5 text-xs font-medium">{o.label}</span>}
          </label>
        ))}
      </div>
      {error && <p id={`${name}-error`} className="mt-1 text-xs text-danger">{error}</p>}
    </fieldset>
  );
}
