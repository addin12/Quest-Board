import Image from "next/image";
import Link from "next/link";
import type { GameCard as GameCardData, GameLanguage } from "@/lib/queries";
import type { T } from "@/lib/i18n/dict";
import { formatIdr, splitList } from "@/lib/policy";
import { LocalTime } from "./local-time";
import { Icon } from "./icon";
import { genreIcon, genreLabelKey, isGenre, parseCategoryCsv } from "@/lib/categories";

// Presentational components. Anything that needs text takes `t` (server pages
// pass it from getI18n()) or an already-translated string.

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Portrait if `image` is set, otherwise initials on a hue gradient. */
export function Avatar({ name, hue, size = 36, image }: { name: string; hue: number; size?: number; image?: string | null }) {
  if (image) {
    return (
      <span aria-hidden className="relative inline-block shrink-0 overflow-hidden rounded-full bg-surface-2" style={{ width: size, height: size }}>
        <Image src={image} alt="" fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  const initials = initialsOf(name);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 40) % 360} 60% 32%))`,
      }}
    >
      {initials}
    </span>
  );
}

export function Stars({ rating, count, t, size = "sm" }: { rating: number | null; count?: number; t: T; size?: "sm" | "lg" }) {
  if (rating == null) return <span className="text-xs text-muted">{t("common.noReviews")}</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${size === "lg" ? "text-base" : "text-xs"}`}>
      <Icon name="star" solid className="text-gold" />
      <span className="font-semibold">{rating.toFixed(1)}</span>
      {count != null && <span className="text-muted">({count})</span>}
      <span className="sr-only">{t("common.outOf5")}</span>
    </span>
  );
}

/** Cover art (4:5, like an Instagram post) if `image` is set; the hue gradient is the fallback (and shows while loading). */
export function Cover({ hue, system, className = "", image, priority = false, sizes, label = true }: {
  hue: number; system: string; className?: string; image?: string | null; priority?: boolean; sizes?: string; label?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(circle at 20% 20%, hsl(${hue} 70% 60% / .9), transparent 55%),
                     radial-gradient(circle at 80% 70%, hsl(${(hue + 50) % 360} 65% 40% / .9), transparent 60%),
                     linear-gradient(135deg, hsl(${hue} 45% 22%), hsl(${(hue + 30) % 360} 50% 12%))`,
      }}
    >
      {image && (
        <Image src={image} alt="" fill priority={priority} sizes={sizes ?? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"} className="object-cover" />
      )}
      {label && (
        <span className="absolute left-3 top-3 rounded-md bg-black/50 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          {system}
        </span>
      )}
    </div>
  );
}

/** Small square game thumbnail for lists (cover art or hue gradient). */
export function Thumb({ hue, image, size = 48 }: { hue: number; image?: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="relative inline-block shrink-0 overflow-hidden rounded-lg"
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 60% 50%), hsl(${(hue + 40) % 360} 50% 25%))` }}
    >
      {image && <Image src={image} alt="" fill sizes={`${size}px`} className="object-cover" />}
    </span>
  );
}

/** "Rp 75.000" or the localized word for free. */
export function priceLabel(amount: number, t: T): string {
  return amount === 0 ? t("common.free") : formatIdr(amount);
}

export function languageLabel(lang: GameLanguage, t: T): string {
  return t(lang === "id" ? "lang.gameId" : lang === "en" ? "lang.gameEn" : "lang.gameBoth");
}

export function GameCard({ game, t }: { game: GameCardData; t: T }) {
  const seatsLeft = game.next_session_at != null ? game.seats_total - (game.next_session_seats_taken ?? 0) : null;
  const tags = splitList(game.tags);
  const genre = parseCategoryCsv(game.genres).find(isGenre);
  return (
    <Link
      href={`/games/${game.slug}`}
      className="card group flex flex-col overflow-hidden transition-colors hover:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Cover hue={game.cover_hue} system={game.system} image={game.cover_image} className="aspect-[4/5] w-full" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold leading-snug group-hover:text-accent">{game.title}</h3>
          <span className="shrink-0 text-right">
            <span className="block font-semibold">{priceLabel(game.price_idr, t)}</span>
            {game.price_idr > 0 && <span className="block text-xs text-muted">{t("common.perSession")}</span>}
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-muted">{game.summary}</p>
        <div className="flex flex-wrap gap-1.5">
          <span className="chip gap-1"><Icon name={game.format === "campaign" ? "scroll-old" : "book-open-cover"} />{t(game.format === "campaign" ? "format.campaign" : "format.one_shot")}</span>
          <span className="chip gap-1 whitespace-normal!"><Icon name={game.location_type === "online" ? "laptop" : "marker"} />{game.location_type === "online" ? t("loc.online") : game.venue_name ? `${game.venue_name} · ${game.city}` : game.city}</span>
          <span className="chip gap-1"><Icon name="language" />{languageLabel(game.language, t)}</span>
          {game.experience_level === "beginner" ? (
            <span className="chip gap-1 border-success/30! bg-success-soft! text-success!"><Icon name="seedling" />{t("level.beginner")}</span>
          ) : (
            genre ? <span className="chip gap-1"><Icon name={genreIcon(genre)} />{t(genreLabelKey(genre))}</span> : tags[0] && <span className="chip">#{tags[0]}</span>
          )}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border pt-3 text-sm">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Avatar name={game.gm_name} hue={game.gm_hue} image={game.gm_image} size={28} />
            <span className="font-medium">{game.gm_name}</span>
            {game.gm_verified ? <VerifiedBadge label={t("common.verifiedGm")} /> : null}
            {game.gm_new ? <NewGmBadge t={t} /> : null}
          </span>
          <Stars rating={game.avg_rating} count={game.review_count} t={t} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {game.next_session_at ? (
            <>
              <span className="inline-flex items-center gap-1"><Icon name="calendar-clock" /><LocalTime iso={game.next_session_at} /></span>
              <span className={`inline-flex items-center gap-1 ${seatsLeft === 0 ? "text-danger" : seatsLeft! <= 2 ? "text-accent" : ""}`}>
                <Icon name="users" />
                {seatsLeft === 0 ? t("common.full") : t("card.seatsLeft", { n: seatsLeft! })}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1"><Icon name="hourglass-end" />{t("card.noSessions")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Error text under a field. Pass the field's `id` so errAttrs() can point the control at it. */
export function FieldError({ msg, id }: { msg?: string; id?: string }) {
  if (!msg) return null;
  // Next to the field, with an icon as well as the colour (never colour alone).
  return (
    <p id={id ? `${id}-error` : undefined} className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-danger">
      <Icon name="triangle-warning" className="mt-0.5 shrink-0" /> <span>{msg}</span>
    </p>
  );
}

/** aria-invalid + aria-describedby for a control whose <FieldError id={id}> is showing `msg`. */
export function errAttrs(id: string, msg?: string | false): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return msg ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};
}

/** "New GM": joined recently, no reviews yet (queries.ts NEW_GM_SQL). The hint says why it's shown. */
export function NewGmBadge({ t, className = "" }: { t: T; className?: string }) {
  return (
    <span title={t("common.newGmHint")} className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-border ${className}`}>
      <Icon name="seedling" /> {t("common.newGm")}
    </span>
  );
}

export function VerifiedBadge({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span title={label} className={`inline-flex text-accent ${className}`}>
      <Icon name="badge-check" solid label={label} />
    </span>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "danger"; children: React.ReactNode }) {
  const icon = { info: "info", success: "check-circle", danger: "triangle-warning" } as const;
  const cls = {
    info: "border-border bg-surface-2 text-text",
    success: "border-success/30 bg-success-soft text-success",
    danger: "border-danger/30 bg-danger-soft text-danger",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${cls}`}>
      <Icon name={icon[tone]} className="mt-0.5 shrink-0 text-base" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Shown while the marketplace has no games yet (launch): what to do instead of an empty grid. */
export function LaunchCard({ t }: { t: T }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Image src="/images/tavern/empty-tankard.svg" alt="" width={180} height={112} className="opacity-90" />
      <h3 className="text-lg font-semibold">{t("launch.title")}</h3>
      <p className="max-w-lg text-sm text-muted">{t("launch.body")}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Link href="/become-a-gm" className="btn-primary"><Icon name="hat-wizard" /> {t("launch.gmCta")}</Link>
        <Link href="/board" className="btn-secondary"><Icon name="thumbtack" /> {t("launch.boardCta")}</Link>
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Image src="/images/tavern/empty-tankard.svg" alt="" width={180} height={112} className="opacity-90" />
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="max-w-md text-sm text-muted">{children}</div>
    </div>
  );
}
