import { parseCspReport } from "@/lib/csp-report";
import { recordError } from "@/lib/error-log";
import { clientIp, hit } from "@/lib/rate-limit";
import { siteOrigin } from "@/lib/site";
import { readTextLimited } from "@/lib/read-body";
import { redactPath } from "@/lib/error-shape";

// Browsers report here when the Content Security Policy blocks something on one of our pages (lib/csp.ts:
// report-uri). Each report becomes a line in the error log, so it shows in Admin → Server errors and in
// the admins' daily summary: a page that breaks because a script was blocked is noticed before players
// complain. Always answers 204 (a browser does nothing with the answer).
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readTextLimited(request, 16 * 1024); // never buffers more than that
  if (body === null || !hit("cspReport", await clientIp())) return new Response(null, { status: 204 });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 204 });
  }
  for (const v of parseCspReport(payload, await siteOrigin())) {
    recordError({ message: `Content Security Policy blocked ${v.directive}: ${v.blocked}`, digest: "csp", method: "CSP", path: redactPath(v.path), route_path: redactPath(v.path), route_type: "csp" });
  }
  return new Response(null, { status: 204 });
}
