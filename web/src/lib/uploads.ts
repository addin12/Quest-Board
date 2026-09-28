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

export const uploadDir = () => process.env.QUESTBOARD_UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");

export type UploadResult = { ok: true; path: string } | { ok: false; error: MsgKey };

export async function saveUpload(userId: number, kind: UploadKind, file: File): Promise<UploadResult> {
  if (file.size > UPLOAD_MAX_BYTES) return { ok: false, error: "v.uploadTooBig" };
  const input = Buffer.from(await file.arrayBuffer());
  if (!detectImageType(input)) return { ok: false, error: "v.uploadType" };
  let output: Buffer;
  try {
    const { width, height } = UPLOAD_SIZES[kind];
    output = await sharp(input, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate() // honour the camera's orientation, then forget it
      .resize(width, height, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { ok: false, error: "v.uploadType" }; // not decodable as the picture it claims to be
  }
  const name = `${randomBytes(16).toString("hex")}.webp`;
  mkdirSync(uploadDir(), { recursive: true });
  writeFileSync(path.join(uploadDir(), name), output);
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
    .prepare("SELECT 1 FROM games WHERE cover_image = ? UNION ALL SELECT 1 FROM users WHERE avatar_image = ? LIMIT 1")
    .get(uploadPath(name), uploadPath(name));
  if (inUse) return;
  rmSync(path.join(uploadDir(), name), { force: true });
  db().prepare("DELETE FROM uploads WHERE file = ?").run(name);
}

/** Account deletion: every picture the person uploaded goes. */
export function deleteUserUploads(userId: number): void {
  const rows = db().prepare("SELECT file FROM uploads WHERE user_id = ?").all(userId) as { file: string }[];
  for (const r of rows) rmSync(path.join(uploadDir(), r.file), { force: true });
  db().prepare("DELETE FROM uploads WHERE user_id = ?").run(userId);
  db().prepare("UPDATE games SET cover_image = '' WHERE gm_id = ? AND cover_image LIKE '/uploads/%'").run(userId);
}

/** The bytes of a stored picture, or null. */
export function readUpload(name: string): Buffer | null {
  if (!isUploadName(name)) return null;
  const file = path.join(uploadDir(), name);
  return existsSync(file) ? readFileSync(file) : null;
}
