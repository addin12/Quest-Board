import type { T } from "@/lib/i18n/dict";
import type { GmRequestRow } from "@/lib/queries";
import { Icon } from "./icon";
import type { RegularIcon } from "@/lib/icons";
import { languageLabel, priceLabel } from "./ui";

/** Server-safe presentational pieces for "Hire a GM" requests. */

export function RequestStatus({ status, t }: { status: GmRequestRow["status"]; t: T }) {
  const cls = {
    open: "border-accent/30! bg-accent-soft! text-accent!",
    matched: "border-success/30! bg-success-soft! text-success!",
    closed: "",
  }[status];
  const icon = { open: "hourglass-end", matched: "handshake", closed: "archive" } as const;
  return (
    <span className={`chip shrink-0 gap-1 ${cls}`}>
      <Icon name={icon[status]} /> {t(status === "open" ? "hire.statusOpen" : status === "matched" ? "hire.statusMatched" : "hire.statusClosed")}
    </span>
  );
}

/** The facts of a request as a definition list. */
export function RequestFacts({ r, t }: { r: GmRequestRow; t: T }) {
  const level = r.experience_level === "beginner" ? "level.beginner" : r.experience_level === "experienced" ? "level.experienced" : "level.any";
  const facts: [RegularIcon, string, string][] = [
    ["dice-d20", t("browse.system"), r.system || t("hire.anySystem")],
    ["users", t("hire.groupSize"), t("hire.players", { n: r.group_size })],
    ["graduation-cap", t("browse.experience"), t(level)],
    ["language", t("browse.language"), languageLabel(r.language, t)],
    [r.location_type === "online" ? "laptop" : "marker", t("browse.where"), r.location_type === "online" ? t("loc.online") : r.city],
    ["calendar-clock", t("hire.schedule"), r.schedule],
    ["coins", t("hire.budget"), r.budget_idr ? t("hire.budgetValue", { price: priceLabel(r.budget_idr, t) }) : t("hire.budgetOpen")],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {facts.map(([icon, label, value]) => (
        <div key={label} className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={icon} /></span>
          <div className="min-w-0">
            <dt className="eyebrow">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
