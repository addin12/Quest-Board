// Read a request body as text, but never more than `max` bytes: an endpoint anyone can post to
// (webhooks, CSP reports) must not buffer a huge body before deciding to refuse it.

/** The body as text, or null when it's (or claims to be) bigger than `max` bytes. */
export async function readTextLimited(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
