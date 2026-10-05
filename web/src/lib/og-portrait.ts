import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { parseUploadPath } from "./upload-rules";
import { readUpload } from "./uploads";

/** A portrait as a small PNG data URI for a share card (next/og can't draw WebP), or null when there is none. */
export async function ogPortrait(image: string | null | undefined): Promise<string | null> {
  if (!image) return null;
  let bytes: Buffer | null = null;
  const upload = parseUploadPath(image);
  if (upload) bytes = readUpload(upload);
  else if (/^\/images\/[\w/-]+\.(webp|png|jpe?g)$/.test(image)) {
    // The built-in placeholder art under public/.
    const file = path.join(/* turbopackIgnore: true */ process.cwd(), "public", image);
    bytes = existsSync(/* turbopackIgnore: true */ file) ? readFileSync(/* turbopackIgnore: true */ file) : null;
  }
  if (!bytes) return null;
  try {
    const png = await sharp(bytes).resize(200, 200, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null; // a damaged file: the card falls back to the initial
  }
}
