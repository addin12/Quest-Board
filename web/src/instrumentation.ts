import type { Instrumentation } from "next";

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
