import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { paymentChangedRecently } from "@/lib/queries";
import { DEFAULT_TIME_ZONE, formatDay } from "@/lib/time-zones";
import { Icon } from "./icon";

/** Under a GM's payment details: they were changed recently (a hijacked account's first move). */
export async function PaymentChangedNote({ gmId }: { gmId: number }) {
  const at = paymentChangedRecently(gmId);
  if (!at) return null;
  const { t, lang } = await getI18n();
  // The viewer's own zone when signed in (Settings), else Indonesia's main one.
  const viewer = await getCurrentUser();
  const tz = viewer ? (db().prepare("SELECT time_zone FROM users WHERE id = ?").get(viewer.id) as { time_zone: string } | undefined)?.time_zone : undefined;
  const date = formatDay(new Date(at), lang, tz ?? DEFAULT_TIME_ZONE);
  return (
    <p className="mt-3 flex items-start gap-1.5 rounded-md bg-danger-soft p-2.5 text-xs text-danger" role="note">
      <Icon name="triangle-warning" className="mt-0.5 shrink-0" /> {t("game.paymentChanged", { date })}
    </p>
  );
}
