// Rendered share pictures (the 1200×630 link previews), kept in memory until what they show changes.
// Drawing one takes a font layout pass plus a sharp resize of the cover (~100–300 ms of CPU); WhatsApp,
// Discord, Telegram and search crawlers each fetch it whenever a link is pasted. The key is everything
// drawn on the card (its text, colour and the picture's path), so editing a game's title, price or cover
// gives a new picture at once and nothing has to be invalidated by hand. Uploads get a new path when
// replaced, so the path stands for the picture. Pure module (no server imports) so node --test can load it.
import { createHash } from "node:crypto";

export type OgCache = {
  (parts: unknown, render: () => Response | Promise<Response>): Promise<Response>;
  /** Pictures held and their total size, for tests. */
  stats(): { entries: number; bytes: number };
};

/** A cache holding at most `maxBytes` of PNG; the least recently shown picture goes first. */
export function makeOgCache(maxBytes: number): OgCache {
  const pictures = new Map<string, Uint8Array>(); // Map order = least recently shown first
  let bytes = 0;
  const cached = (async (parts, render) => {
    const key = createHash("sha256").update(JSON.stringify(parts)).digest("base64url").slice(0, 32);
    let png = pictures.get(key);
    if (png) {
      pictures.delete(key);
      pictures.set(key, png);
    } else {
      png = new Uint8Array(await (await render()).arrayBuffer());
      pictures.set(key, png);
      bytes += png.byteLength;
      for (const [k, v] of pictures) {
        if (bytes <= maxBytes) break;
        pictures.delete(k);
        bytes -= v.byteLength;
      }
    }
    return new Response(png.slice(), {
      headers: {
        "Content-Type": "image/png",
        // Link-preview services keep their own copy anyway; ten minutes here, then a fresh look.
        "Cache-Control": "public, max-age=600, stale-while-revalidate=86400",
        ETag: `"${key}"`,
      },
    });
  }) as OgCache;
  cached.stats = () => ({ entries: pictures.size, bytes });
  return cached;
}

/** The app's cache: 24 MB, about a hundred game and GM pictures. */
export const ogCached = makeOgCache(24 * 1024 * 1024);
