// Pure: what an uploaded picture may be, and where it lives. (lib/uploads.ts does the work.)

export type UploadKind = "cover" | "portrait" | "qris";

/** Biggest file accepted from a phone camera; it's re-encoded much smaller. */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Output size: covers are 4:5 portraits (Instagram's post shape), portraits are square (shown round). */
export const UPLOAD_SIZES: Record<UploadKind, { width: number; height: number }> = {
  cover: { width: 1080, height: 1350 },
  portrait: { width: 512, height: 512 },
  qris: { width: 900, height: 900 }, // the most it's scaled down to; never cropped (lib/uploads.ts)
};

export const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";
/** What to tell someone about a cover picture before they save: too wide for 4:5, or too small to look sharp. */
export function coverAdvice(width: number, height: number): ("wide" | "small")[] {
  const out: ("wide" | "small")[] = [];
  if (width / height > 1.1) out.push("wide"); // landscape: its sides are cut off to make it tall
  const { width: W, height: H } = UPLOAD_SIZES.cover;
  if (width < W * 0.6 || height < H * 0.6) out.push("small"); // shown up to 1080×1350: below ~650 px wide it blurs
  return out;
}


/** Stored names are random: 32 hex characters + .webp. Nothing else is ever served. */
const NAME = /^[a-f0-9]{32}\.webp$/;
export const isUploadName = (name: string) => NAME.test(name);
export const uploadPath = (name: string) => `/uploads/${name}`;

/** The stored name inside an "/uploads/<name>" value, or null if it isn't one. */
export function parseUploadPath(value: string): string | null {
  const m = /^\/uploads\/([^/]+)$/.exec(value);
  return m && isUploadName(m[1]) ? m[1] : null;
}

/** JPEG, PNG or WebP, judged by the file's first bytes (never by its name or declared type). */
export function detectImageType(b: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}
