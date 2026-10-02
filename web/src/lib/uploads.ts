import "server-only";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "./db";
import type { MsgKey } from "./i18n/dict";
import { UPLOAD_MAX_BYTES, UPLOAD_SIZES, detectImageType, isUploadName, parseUploadPath, uploadPath, type UploadKind } from "./upload-rules";

// Pictures people upload (game covers, portraits). Every file is decoded and re-encoded by sharp:
// resized and cropped to fit, turned upright, saved as WebP — which drops hidden metadata such as a
// phone photo's GPS location, and turns anything malformed or disguised into a plain image (or a
// refusal). Files get random names and are served only from /uploads/<name> (app/uploads/[file]).

export const uploadDir = () => process.env.QUESTBOARD_UPLOAD_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data", "uploads");

export type UploadResult = { ok: true; path: string } | { ok: false; error: MsgKey };

export async function saveUpload(userId: number, kind: UploadKind, file: File): Promise<UploadResult> {
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: "v.uploadTooBig" };
  const input = Buffer.from(await file.arrayBuffer());
  if (!detectImageType(input)) return { ok: false, error: "v.uploadType" };
  let output: Buffer;
  try {
    const { width, height } = UPLOAD_SIZES[kind];
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" }).rotate(); // honour the camera's orientation, then forget it
    output = kind === "qris"
      // A QRIS code must still scan: never cropped, only made smaller, on white, without lossy blur.
      ? await image.resize(width, height, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).webp({ lossless: true }).toBuffer()
      : await image.resize(width, height, { fit: "cover", position: "attention" }).webp({ quality: 82 }).toBuffer();
  } catch {
    return { ok: false, error: "v.uploadType" }; // not decodable as the picture it claims to be
  }
  const name = `${randomBytes(16).toString("hex")}.webp`;
  mkdirSync(/* turbopackIgnore: true */ uploadDir(), { recursive: true });
  writeFileSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ uploadDir(), name), output);
  db().prepare("INSERT INTO uploads (user_id, kind, file) VALUES (?, ?, ?)").run(userId, kind, name);
  return { ok: true, path: uploadPath(name) };
}

/** Whether `value` is a picture this person uploaded, of this kind (so nobody can use someone else's). */
export function ownsUpload(userId: number, kind: UploadKind, value: string): boolean {
  const name = parseUploadPath(value);
  return !!name && !!db().prepare("SELECT 1 FROM uploads WHERE file = ? AND user_id = ? AND kind = ?").get(name, userId, kind);
}

/** An upload that's no longer shown anywhere (replaced, reset): delete the file and its record. */
export function discardUpload(value: string | null | undefined): void {
  const name = value ? parseUploadPath(value) : null;
  if (!name) return;
  const inUse = db()
    .prepare("SELECT 1 FROM games WHERE cover_image = ? UNION ALL SELECT 1 FROM users WHERE avatar_image = ? UNION ALL SELECT 1 FROM gm_profiles WHERE payment_qr = ? LIMIT 1")
    .get(uploadPath(name), uploadPath(name), uploadPath(name));
  if (inUse) return;
  rmSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ uploadDir(), name), { force: true });
  db().prepare("DELETE FROM uploads WHERE file = ?").run(name);
}

/**
 * Housekeeping (from the cron route): pictures nothing shows any more — a save that failed after the
 * upload, a picture replaced by one that was never saved — are removed after `olderThanMs` (a day).
 */
export function pruneOrphanUploads(olderThanMs = 86_400_000, now = Date.now()): number {
  const cutoff = new Date(now - olderThanMs).toISOString();
  const orphans = db()
    .prepare(
      `SELECT u.file FROM uploads u
        WHERE u.created_at < ?
          AND NOT EXISTS (SELECT 1 FROM games g WHERE g.cover_image = '/uploads/' || u.file)
          AND NOT EXISTS (SELECT 1 FROM users x WHERE x.avatar_image = '/uploads/' || u.file)
          AND NOT EXISTS (SELECT 1 FROM gm_profiles p WHERE p.payment_qr = '/uploads/' || u.file)`,
    )
    .all(cutoff) as { file: string }[];
  for (const o of orphans) {
    rmSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ uploadDir(), o.file), { force: true });
    db().prepare("DELETE FROM uploads WHERE file = ?").run(o.file);
  }
  return orphans.length;
}

/** Account deletion: every picture the person uploaded goes. */
export function deleteUserUploads(userId: number): void {
  const rows = db().prepare("SELECT file FROM uploads WHERE user_id = ?").all(userId) as { file: string }[];
  for (const r of rows) rmSync(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ uploadDir(), r.file), { force: true });
  db().prepare("DELETE FROM uploads WHERE user_id = ?").run(userId);
  db().prepare("UPDATE games SET cover_image = '' WHERE gm_id = ? AND cover_image LIKE '/uploads/%'").run(userId);
}

/** An upload's kind (a QRIS code is only served through /payment-qr, to booked players). */
export function uploadKind(name: string): UploadKind | null {
  return (db().prepare("SELECT kind FROM uploads WHERE file = ?").get(name) as { kind: UploadKind } | undefined)?.kind ?? null;
}

/** The bytes of a stored picture, or null. */
export function readUpload(name: string): Buffer | null {
  if (!isUploadName(name)) return null;
  const file = path.join(/* turbopackIgnore: true */ uploadDir(), name);
  return existsSync(/* turbopackIgnore: true */ file) ? readFileSync(/* turbopackIgnore: true */ file) : null;
}
