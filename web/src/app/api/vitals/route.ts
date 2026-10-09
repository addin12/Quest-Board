import { parseVital } from "@/lib/vitals";
import { recordVital } from "@/lib/vitals-store";
import { clientIp, hit } from "@/lib/rate-limit";
import { readTextLimited } from "@/lib/read-body";

/**
 * POST /api/vitals — one Core Web Vitals measurement from a visitor's browser (components/web-vitals.tsx,
 * sent with navigator.sendBeacon). Body: {"path": "/games/x", "name": "LCP", "value": 1234}.
 * Stored by route pattern only, kept 30 days, summarised on Admin → Errors. Always answers 204.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readTextLimited(request, 2 * 1024);
  if (body === null || !hit("vitals", await clientIp())) return new Response(null, { status: 204 });
  try {
    const v = parseVital(JSON.parse(body));
    if (v) recordVital(v);
  } catch {
    // not JSON: ignored
  }
  return new Response(null, { status: 204 });
}
