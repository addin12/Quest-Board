import Link from "next/link";
import type { T } from "@/lib/i18n/dict";
import type { GmDirectoryRow } from "@/lib/queries";
import { genreLabelKey, isGenre, parseCategoryCsv } from "@/lib/categories";
import { isOnlineLocation, splitList } from "@/lib/policy";
import { Avatar, Stars, VerifiedBadge, priceLabel } from "./ui";
import { Icon } from "./icon";

/** A Game Master in the "Hire a GM" directory. */
export function GmCard({ gm, t }: { gm: GmDirectoryRow; t: T }) {
  const genres = [...new Set(parseCategoryCsv(gm.genres))].filter(isGenre).slice(0, 3);
  const systems = splitList(gm.systems).slice(0, 3);
  const online = isOnlineLocation(gm.location);
  return (
    <article className="card flex flex-col p-5">
      <div className="flex items-start gap-4">
        <Avatar name={gm.name} hue={gm.avatar_hue} image={gm.avatar_image} size={64} />
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1.5 text-lg font-semibold leading-snug">
            <Link href={`/gms/${gm.id}`} className="truncate hover:text-accent">{gm.name}</Link>
            {gm.verified ? <VerifiedBadge label={t("common.verifiedGm")} /> : null}
          </h3>
          <p className="line-clamp-2 text-sm text-muted">{gm.headline}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <Stars rating={gm.avg_rating} count={gm.review_count} t={t} />
        <span className="inline-flex items-center gap-1"><Icon name="dice-d20" /> {t("hire.sessionsHosted", { n: gm.sessions_hosted })}</span>
        <span className="inline-flex items-center gap-1"><Icon name="graduation-cap" /> {t("hire.yearsShort", { n: gm.years_experience })}</span>
        <span className="inline-flex items-center gap-1"><Icon name={online ? "laptop" : "marker"} /> {online ? t("loc.online") : gm.location}</span>
      </div>
      <div className="mt-3 mb-4 flex flex-wrap gap-1.5">
        {systems.map((s) => <span key={s} className="chip gap-1"><Icon name="dice-d20" />{s}</span>)}
        {genres.map((g) => <span key={g} className="chip">{t(genreLabelKey(g))}</span>)}
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <span className="text-sm">
          {gm.min_price != null ? (
            <>{t("hire.from")} <strong>{priceLabel(gm.min_price, t)}</strong> <span className="text-xs text-muted">{t("common.perSession")}</span></>
          ) : (
            <span className="text-muted">{t("hire.noListings")}</span>
          )}
        </span>
        <span className="flex gap-2">
          <Link href={`/gms/${gm.id}`} className="btn-ghost px-3! py-1.5!"><Icon name="eye" /> {t("hire.viewProfile")}</Link>
          <Link href={`/hire-a-gm/request?gm=${gm.id}`} className="btn-primary px-3! py-1.5!"><Icon name="briefcase" /> {t("hire.requestThisGm")}</Link>
        </span>
      </div>
    </article>
  );
}
