import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { parseUploadPath } from "./upload-rules";
import { readUpload } from "./uploads";

/** A picture (upload or built-in art) as a PNG data URI of the given size for a share card, or null. */
async function ogPicture(image: string | null | undefined, width: number, height: number): Promise<string | null> {
  if (!image) return null;
  let bytes: Buffer | null = null;
  const upload = parseUploadPath(image);
  if (upload) bytes = readUpload(upload);
  else if (/^\/images\/[\w/-]+\.(webp|png|jpe?g|svg)$/.test(image)) {
    // The built-in art (covers and portraits are SVG; sharp draws them).
    // The built-in placeholder art under public/.
    const file = path.join(/* turbopackIgnore: true */ process.cwd(), "public", image);
    bytes = existsSync(/* turbopackIgnore: true */ file) ? readFileSync(/* turbopackIgnore: true */ file) : null;
  }
  if (!bytes) return null;
  try {
    const png = await sharp(bytes).resize(width, height, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null; // a damaged file: the card falls back to the initial
  }
}

/** A portrait (200×200) for a share card (next/og can't draw WebP), or null when there is none. */
export const ogPortrait = (image: string | null | undefined) => ogPicture(image, 200, 200);

/** A game's 4:5 cover (404×505) for its share card, or null (the card then draws the colour gradient). */
export const ogCover = (image: string | null | undefined) => ogPicture(image, 404, 505);
