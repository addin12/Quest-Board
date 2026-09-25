import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Icon } from "@/components/icon";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-4xl text-accent"><Icon name="dice-d20" /></span>
      <h1 className="mt-4 text-3xl font-bold">{t("notFound.title")}</h1>
      <p className="mt-2 text-muted">{t("notFound.body")}</p>
      <Link href="/games" className="btn-primary mt-6">{t("footer.browse")}</Link>
    </div>
  );
}
