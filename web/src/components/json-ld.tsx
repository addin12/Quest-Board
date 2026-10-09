import { jsonLdString } from "@/lib/seo";

/** Structured data for search engines (lib/seo.ts builders). Server-rendered; never executed. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
