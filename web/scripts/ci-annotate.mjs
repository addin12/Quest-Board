// On GitHub Actions, turn a failure into an annotation: annotations are public, the raw job log isn't
// (it needs sign-in). Off CI it just prints the message. Used by the rehearsal scripts.
const enc = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "").replace(/\n/g, "%0A");

/** Report `message` (and up to the last 40 lines of `details`) as a CI error. */
export function annotateError(title, message, details = "") {
  const tail = String(details).trim().split("\n").slice(-40).join("\n");
  const text = tail ? `${message}\n${tail}` : String(message);
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::error title=${enc(title)}::${enc(text)}`);
  else console.error(`[${title}] ${text}`);
}
