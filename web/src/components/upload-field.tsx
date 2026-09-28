"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n-provider";
import { Icon } from "./icon";
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES } from "@/lib/upload-rules";

/**
 * "Or upload your own picture": a file input with a preview. The picture is sent with the form and
 * used (instead of the choice above) when the form is saved; the server checks and re-encodes it.
 */
export function UploadField({ name, label, hint, shape }: { name: string; label: string; hint: string; shape: "wide" | "round" }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const id = `${name}-file`;
  const clear = () => {
    if (input.current) input.current.value = "";
    setPreview(null);
  };
  return (
    <div className="rounded-lg border border-dashed border-border p-3">
      <label htmlFor={id} className="label">{label}</label>
      <p id={`${id}-hint`} className="-mt-0.5 mb-2 text-xs text-muted">{hint}</p>
      <div className="flex flex-wrap items-center gap-3">
        {preview && (
          // A local blob: preview of the chosen file (next/image can't load blob: URLs).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t("upload.previewAlt")} className={shape === "round" ? "h-16 w-16 rounded-full object-cover" : "h-16 w-32 rounded-md object-cover"} />
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
            setPreview(URL.createObjectURL(f));
          }}
        />
        {preview && (
          <button type="button" onClick={clear} className="btn-ghost px-2! py-1! text-xs"><Icon name="cross-circle" /> {t("upload.clear")}</button>
        )}
      </div>
      {preview && <p className="mt-2 text-xs font-semibold text-accent">{t("upload.willUse")}</p>}
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
