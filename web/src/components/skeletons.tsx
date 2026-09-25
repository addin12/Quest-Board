import { getI18n } from "@/lib/i18n/server";

// Loading placeholders (used by route-level loading.tsx files). They keep the page's
// shape so nothing jumps when content arrives, and announce "Loading…" once.

export async function PageSkeleton({ variant = "cards" }: { variant?: "cards" | "detail" | "list" }) {
  const { t } = await getI18n();
  return (
    <div className="mx-auto max-w-6xl px-4 py-10" role="status" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <div aria-hidden>
        <div className="skeleton h-9 w-64" />
        <div className="skeleton mt-3 h-4 w-96 max-w-full" />
        {variant === "cards" && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="skeleton h-32 rounded-none" />
                <div className="space-y-2 p-4">
                  <div className="skeleton h-5 w-3/4" />
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-3 w-2/3" />
                  <div className="flex gap-2 pt-2"><div className="skeleton h-5 w-16" /><div className="skeleton h-5 w-16" /></div>
                </div>
              </div>
            ))}
          </div>
        )}
        {variant === "detail" && (
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3">
              <div className="skeleton h-48" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-5/6" />
              <div className="skeleton h-4 w-2/3" />
            </div>
            <div className="card space-y-3 p-5"><div className="skeleton h-7 w-32" /><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
          </div>
        )}
        {variant === "list" && (
          <div className="mt-8 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card flex items-center gap-4 p-4">
                <div className="skeleton h-12 w-12" />
                <div className="flex-1 space-y-2"><div className="skeleton h-4 w-1/2" /><div className="skeleton h-3 w-3/4" /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
