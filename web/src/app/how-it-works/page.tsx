import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { Icon } from "@/components/icon";
import { JsonLd } from "@/components/json-ld";
import { webPageJsonLd } from "@/lib/seo";
import { siteOrigin } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("footer.howItWorks") };
}

export default async function HowItWorksPage() {
  const { t } = await getI18n();
  const origin = await siteOrigin();
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <JsonLd data={webPageJsonLd({ name: t("how.title"), description: t("how.p1"), url: `${origin}/how-it-works` })} />
      <h1 className="text-4xl font-bold">{t("how.title")}</h1>
      <section className="mt-10">
        <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="dice-d20" className="text-accent" /> {t("how.players")}</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5">
          {(["how.p1", "how.p2", "how.p3", "how.p4"] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
        <div className="card mt-6 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Icon name="handshake" className="text-accent" /> {t("how.payTitle")}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>{t("how.pay1")}</li>
            <li>{t("how.pay2")}</li>
            <li>{t("how.pay3")}</li>
          </ul>
        </div>
      </section>
      <section id="gms" className="mt-12 scroll-mt-24">
        <h2 className="flex items-center gap-2 text-2xl font-bold"><Icon name="hat-wizard" className="text-accent" /> {t("how.gms")}</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5">
          {(["how.g1", "how.g2", "how.g3", "how.g4"] as const).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
        <Link href="/become-a-gm" className="btn-primary mt-6"><Icon name="arrow-right" /> {t("nav.becomeGm")}</Link>
      </section>
    </div>
  );
}
