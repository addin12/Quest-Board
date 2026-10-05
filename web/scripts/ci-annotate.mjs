// On GitHub Actions, turn a failure into an annotation: annotations are public, the raw job log isn't
// (it needs sign-in). Off CI it just prints the message. Used by the rehearsal scripts.
import { appendFileSync } from "node:fs";

const enc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");
const onCi = () => process.env.GITHUB_ACTIONS === "true";

/** Report `message` (and up to the last 40 lines of `details`) as a CI error. */
export function annotateError(title, message, details = "") {
  const tail = String(details).trim().split("\n").slice(-40).join("\n");
  const text = tail ? `${message}\n${tail}` : String(message);
  if (onCi()) console.log(`::error title=${enc(title)}::${enc(text)}`);
  else console.error(`[${title}] ${text}`);
}

/** A warning (CI annotation, or a line on the console): shown on the run, doesn't fail it. */
export function annotateWarning(title, message) {
  if (onCi()) console.log(`::warning title=${enc(title)}::${enc(message)}`);
  else console.warn(`[${title}] ! ${message}`);
}

/** A notice: a number worth keeping visible on the run (e.g. the load rehearsal's rate). */
export function annotateNotice(title, message) {
  if (onCi()) console.log(`::notice title=${enc(title)}::${enc(message)}`);
  else console.log(`[${title}] ${message}`);
}

/** Markdown for the run's summary page (GitHub Actions only). */
export function stepSummary(markdown) {
  if (onCi() && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown.trimEnd() + "\n");
}
