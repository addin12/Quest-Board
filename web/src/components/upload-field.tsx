"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES, coverAdvice } from "@/lib/upload-rules";
import { FieldError } from "./ui";


/**
 * "Or upload your own picture": a file input with a preview. The picture is sent with the form and
 * used (instead of the choice above) when the form is saved; the server checks and re-encodes it.
 */
export function UploadField({ name, label, hint, shape }: { name: string; label: string; hint: string; shape: "poster" | "round" }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<{ kinds: ("wide" | "small")[]; w: number; h: number } | null>(null);
  const poster = shape === "poster";
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const id = `${name}-file`;
  const clear = () => {
    if (input.current) input.current.value = "";
    setPreview(null);
    setAdvice(null);
  };
  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <label htmlFor={id} className="label">{label}</label>
      <p id={`${id}-hint`} className="-mt-0.5 mb-2 text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        {preview && !poster && (
          // A local blob: preview of the chosen file (next/image can't load blob: URLs).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t("upload.previewAlt")} className="h-16 w-16 rounded-full object-cover" />
        )}
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          accept={UPLOAD_ACCEPT}
          aria-describedby={`${id}-hint`}
          className="max-w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-text"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setError(null);
            if (!f) return setPreview(null);
            if (f.size > UPLOAD_MAX_BYTES) {
              setError(t("v.uploadTooBig"));
              return clear();
            }
            const url = URL.createObjectURL(f);
            setPreview(url);
            setAdvice(null);
            if (poster) {
              // Read the picture's size to warn before saving (the server crops it to 4:5 either way).
              const img = new Image();
              img.onload = () => setAdvice({ kinds: coverAdvice(img.naturalWidth, img.naturalHeight), w: img.naturalWidth, h: img.naturalHeight });
              img.src = url;
            }
          }}
        />
        {preview && (
          <button type="button" onClick={clear} className="btn-ghost px-2! py-1! text-xs"><Icon name="cross-circle" /> {t("upload.clear")}</button>
        )}
      </div>
      {preview && poster && (
        // The cover exactly as it will be cut: 4:5, centred.
        <figure className="mt-3 flex flex-wrap items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview */}
          <img src={preview} alt={t("upload.previewAlt")} className="aspect-[4/5] w-36 rounded-lg border border-border object-cover" data-testid="cover-preview" />
          <figcaption className="min-w-0 flex-1 basis-48 space-y-2 text-sm">
            <p className="font-semibold">{t("upload.posterPreview")}</p>
            {advice?.kinds.includes("wide") && (
              <p className="flex items-start gap-1.5 text-gold" data-testid="cover-wide"><Icon name="triangle-warning" className="mt-0.5 shrink-0" /> {t("upload.tooWide")}</p>
            )}
            {advice?.kinds.includes("small") && (
              <p className="flex items-start gap-1.5 text-gold" data-testid="cover-small"><Icon name="triangle-warning" className="mt-0.5 shrink-0" /> {t("upload.tooSmall", { w: advice.w, h: advice.h })}</p>
            )}
          </figcaption>
        </figure>
      )}
      {preview && <p className="mt-2 text-xs font-semibold text-accent">{t("upload.willUse")}</p>}
      {error && <div role="alert"><FieldError msg={error} /></div>}
    </div>
  );
}
