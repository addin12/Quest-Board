import type { Instrumentation } from "next";

// At startup, a production server logs what its setup check finds (lib/setup-check.ts), so a
// deployment mistake shows up in the logs before anyone uses the site.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  try {
    const { currentSetupChecks } = await import("./lib/setup-facts");
    const { makeT } = await import("./lib/i18n/dict");
    const t = makeT("en");
    for (const c of currentSetupChecks()) {
      if (c.level === "ok") continue;
      console.warn(`[quest-board] setup ${c.level === "danger" ? "PROBLEM" : "check"}: ${t(c.title)} — ${t(c.detail, c.vars)}`);
    }
  } catch (err) {
    console.error("[quest-board] setup check failed", err);
  }
}

// Server errors go to the error_log table (see /admin/errors) as well as the console, so a
// self-hosted Quest Board has error monitoring without a third-party service.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { isControlFlow, shapeError } = await import("./lib/error-shape");
    if (isControlFlow(err)) return;
    const { recordError } = await import("./lib/error-log");
    recordError(shapeError(err, request, context));
  } catch (logErr) {
    console.error("[quest-board] could not record an error", logErr);
  }
};
