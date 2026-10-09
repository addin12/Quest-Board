// Uploaded pictures: checked by content, re-encoded (no hidden metadata), owned, cleaned up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const root = mkdtempSync(join(tmpdir(), "qb-uploads-"));
process.env.QUESTBOARD_DB = join(root, "test.db");
process.env.QUESTBOARD_UPLOAD_DIR = join(root, "uploads");
process.env.QUESTBOARD_SEED = "false";
const { db } = await import("../../src/lib/db.ts");
const { saveUpload, ownsUpload, discardUpload, deleteUserUploads, readUpload, pruneOrphanUploads } = await import("../../src/lib/uploads.ts");
const { detectImageType, parseUploadPath, UPLOAD_MAX_BYTES } = await import("../../src/lib/upload-rules.ts");

const user = (email: string) => Number(db().prepare("INSERT INTO users (email, password_hash, name) VALUES (?, 'x', ?)").run(email, email).lastInsertRowid);
const file = (bytes: Uint8Array | Buffer, name = "photo.jpg", type = "image/jpeg") => new File([new Uint8Array(bytes)], name, { type });
/** A phone-like photo: 3000×2000, with EXIF (camera, a copyright marker) that must not survive. */
const photo = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 40 } } })
  .jpeg().withExif({ IFD0: { Make: "PhoneCo", Copyright: "SECRET-LOCATION-MARKER" } }).toBuffer();

test("file types are judged by their first bytes, and only /uploads/<32 hex>.webp paths are ours", () => {
  assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0])), "jpeg");
  assert.equal(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png");
  assert.equal(detectImageType(new TextEncoder().encode("RIFF1234WEBPVP8 ")), "webp");
  assert.equal(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>")), null);
  assert.equal(detectImageType(new TextEncoder().encode("GIF89a......")), null);
  const name = "0123456789abcdef0123456789abcdef.webp";
  assert.equal(parseUploadPath(`/uploads/${name}`), name);
  for (const bad of ["/uploads/../secret.db", "/uploads/x.webp", `/uploads/${name}/x`, `https://evil.test/uploads/${name}`, "/covers/a.webp"]) assert.equal(parseUploadPath(bad), null, bad);
});

test("an upload is re-encoded to WebP at the right size, without the photo's hidden metadata", async () => {
  const gm = user("gm@x.test");
  const up = await saveUpload(gm, "cover", file(await photo()));
  assert.ok(up.ok);
  const name = parseUploadPath(up.path)!;
  const stored = readUpload(name)!;
  const meta = await sharp(stored).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height], [1080, 1350]);
  assert.equal(meta.exif, undefined); // camera, copyright — and GPS on real photos — are gone
  assert.ok(!stored.includes(Buffer.from("SECRET-LOCATION-MARKER")));

  const portrait = await saveUpload(gm, "portrait", file(await photo()));
  assert.ok(portrait.ok);
  const pm = await sharp(readUpload(parseUploadPath(portrait.path)!)!).metadata();
  assert.deepEqual([pm.width, pm.height], [512, 512]);
});

test("fakes and oversize files are refused, and nothing is stored for them", async () => {
  const gm = user("gm2@x.test");
  const before = readdirSync(process.env.QUESTBOARD_UPLOAD_DIR!).length;
  assert.deepEqual(await saveUpload(gm, "cover", file(new TextEncoder().encode("<svg onload=alert(1)></svg>"), "cute.jpg")), { ok: false, error: "v.uploadType" });
  const truncated = (await photo()).subarray(0, 200); // starts like a JPEG, isn't one
  assert.deepEqual(await saveUpload(gm, "cover", file(truncated)), { ok: false, error: "v.uploadType" });
  assert.deepEqual(await saveUpload(gm, "cover", file(Buffer.alloc(UPLOAD_MAX_BYTES + 1, 0xff))), { ok: false, error: "v.uploadTooBig" });
  assert.equal(readdirSync(process.env.QUESTBOARD_UPLOAD_DIR!).length, before);
});

test("only the uploader can use a picture; replaced and deleted-account pictures are removed", async () => {
  const a = user("a@x.test");
  const b = user("b@x.test");
  const up = await saveUpload(a, "portrait", file(await photo()));
  assert.ok(up.ok);
  assert.equal(ownsUpload(a, "portrait", up.path), true);
  assert.equal(ownsUpload(b, "portrait", up.path), false); // someone else's
  assert.equal(ownsUpload(a, "cover", up.path), false); // a portrait isn't a cover
  const onDisk = join(process.env.QUESTBOARD_UPLOAD_DIR!, parseUploadPath(up.path)!);

  db().prepare("UPDATE users SET avatar_image = ? WHERE id = ?").run(up.path, a);
  discardUpload(up.path); // still in use: kept
  assert.ok(existsSync(onDisk));
  db().prepare("UPDATE users SET avatar_image = '' WHERE id = ?").run(a);
  discardUpload(up.path); // replaced: gone
  assert.ok(!existsSync(onDisk));
  assert.equal(ownsUpload(a, "portrait", up.path), false);

  const again = await saveUpload(a, "portrait", file(await photo()));
  assert.ok(again.ok);
  deleteUserUploads(a);
  assert.ok(!existsSync(join(process.env.QUESTBOARD_UPLOAD_DIR!, parseUploadPath(again.path)!)));
  assert.equal((db().prepare("SELECT COUNT(*) AS n FROM uploads WHERE user_id = ?").get(a) as { n: number }).n, 0);
});

test("the daily clean-up removes pictures nothing shows, after a day, and keeps the ones in use", async () => {
  const gm = user("tidy@x.test");
  const used = await saveUpload(gm, "portrait", file(await photo()));
  const orphan = await saveUpload(gm, "portrait", file(await photo()));
  assert.ok(used.ok && orphan.ok);
  db().prepare("UPDATE users SET avatar_image = ? WHERE id = ?").run(used.path, gm);
  const dir = process.env.QUESTBOARD_UPLOAD_DIR!;
  assert.equal(pruneOrphanUploads(), 0); // too new: the person may still be saving the form
  const tomorrow = Date.now() + 2 * 86_400_000;
  assert.ok(pruneOrphanUploads(86_400_000, tomorrow) >= 1);
  assert.ok(existsSync(join(dir, parseUploadPath(used.path)!)));
  assert.ok(!existsSync(join(dir, parseUploadPath(orphan.path)!)));
});

test("cover advice: wide pictures are cropped at the sides, small ones may blur", async () => {
  const { coverAdvice } = await import("../../src/lib/upload-rules.ts");
  assert.deepEqual(coverAdvice(1080, 1350), []); // the ideal 4:5
  assert.deepEqual(coverAdvice(1200, 1200), []); // square: a little off the sides, still fine
  assert.deepEqual(coverAdvice(1920, 1080), ["wide"]);
  assert.deepEqual(coverAdvice(500, 625), ["small"]);
  assert.deepEqual(coverAdvice(800, 450), ["wide", "small"]);
});
