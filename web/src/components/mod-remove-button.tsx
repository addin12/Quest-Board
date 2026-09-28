import { getI18n } from "@/lib/i18n/server";
import type { ReportTarget } from "@/lib/reports";
import { moderatorRemoveAction } from "@/app/actions";
import { ConfirmButton } from "./submit-button";
import { Icon } from "./icon";

/** Admins only: remove this now, without a report (the author is told why; it's in the moderator log). */
export async function ModRemoveButton({ targetType, targetId, className = "" }: { targetType: ReportTarget; targetId: number; className?: string }) {
  const { t } = await getI18n();
  return (
    <form action={moderatorRemoveAction} className={`inline-block ${className}`}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <ConfirmButton className="btn-ghost px-2! py-1! text-xs text-danger!" message={t("mod.removeConfirm")}>
        <Icon name="shield" /> {t("mod.remove")}
      </ConfirmButton>
    </form>
  );
}
