import Image from "next/image";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Icon } from "@/components/icon";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <Image src="/images/tavern/natural-one.svg" alt="" width={300} height={183} priority />
      <h1 className="mt-4 text-3xl font-bold">{t("notFound.title")}</h1>
      <p className="mt-2 text-muted">{t("notFound.body")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/games" className="btn-primary"><Icon name="search" /> {t("footer.browse")}</Link>
        <Link href="/" className="btn-secondary">{t("notFound.home")}</Link>
      </div>
    </div>
  );
}
