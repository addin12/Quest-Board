import { getI18n } from "@/lib/i18n/server";
import { paymentChangedRecently } from "@/lib/queries";
import { Icon } from "./icon";

/** Under a GM's payment details: they were changed recently (a hijacked account's first move). */
export async function PaymentChangedNote({ gmId }: { gmId: number }) {
  const at = paymentChangedRecently(gmId);
  if (!at) return null;
  const { t, lang } = await getI18n();
  const date = new Date(at).toLocaleDateString(lang === "id" ? "id-ID" : "en-GB", { day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
  return (
    <p className="mt-3 flex items-start gap-1.5 rounded-md bg-danger-soft p-2.5 text-xs text-danger" role="note">
      <Icon name="triangle-warning" className="mt-0.5 shrink-0" /> {t("game.paymentChanged", { date })}
    </p>
  );
}
