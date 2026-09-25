"use client"; // Error boundaries must be Client Components

import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Icon } from "@/components/icon";

/** Route-level error boundary. Renders inside the root layout, so i18n and styles are available. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center" role="alert">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-danger-soft text-4xl text-danger">
        <Icon name="dice-d20" />
      </span>
      <h1 className="mt-4 text-3xl font-bold">{t("error.title")}</h1>
      <p className="mt-2 text-muted">{t("error.body")}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">ref: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <button type="button" className="btn-primary" onClick={() => retry()}>
          <Icon name="arrow-right" /> {t("error.retry")}
        </button>
        <Link href="/" className="btn-secondary">{t("error.home")}</Link>
      </div>
    </div>
  );
}
