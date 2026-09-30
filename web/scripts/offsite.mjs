// Off-site copies of the nightly backup, to S3-compatible storage (Cloudflare R2, Backblaze B2, AWS
// S3…): a backup on the same disk doesn't survive losing the disk.
//
//   npm run db:offsite          upload the newest backup (gzipped) and any pictures not sent yet
//   npm run db:fetch-offsite    after losing the server: download the newest backup into the backup
//                               folder and every picture missing from the upload folder, then print
//                               the restore command to run
//
// Settings (deploy/.env): QUESTBOARD_OFFSITE_ENDPOINT (https://…), QUESTBOARD_OFFSITE_BUCKET,
// QUESTBOARD_OFFSITE_REGION (R2: auto), QUESTBOARD_OFFSITE_KEY_ID, QUESTBOARD_OFFSITE_SECRET and
// optionally QUESTBOARD_OFFSITE_PREFIX (default questboard/). Old copies are removed by the bucket's
// own lifecycle rule (set one: e.g. delete after 60 days). The result goes into app_state
// (offsite_last) for Admin → Setup. Requests are signed with AWS Signature V4 (no SDK needed).
import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
// RFC 3986 encoding per path segment, as SigV4 wants it.
const encodePath = (path) => path.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");

/**
 * AWS Signature V4 for one request. `headers` must include host; x-amz-date and x-amz-content-sha256
 * are added. Returns the headers to send (with Authorization).
 */
export function signV4({ method, url, headers = {}, payloadHash, region, accessKeyId, secretAccessKey, service = "s3", now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const date = amzDate.slice(0, 8);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
  const names = Object.keys(all).sort();
  const query = [...u.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const canonical = [method, encodePath(decodeURIComponent(u.pathname)), query, names.map((n) => `${n}:${all[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, date), region), service), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

/** @param {Record<string, string | undefined>} [env] */
export function offsiteSettings(env = process.env) {
  const s = {
    endpoint: (env.QUESTBOARD_OFFSITE_ENDPOINT ?? "").replace(/\/+$/, ""),
    bucket: env.QUESTBOARD_OFFSITE_BUCKET ?? "",
    region: env.QUESTBOARD_OFFSITE_REGION || "auto",
    accessKeyId: env.QUESTBOARD_OFFSITE_KEY_ID ?? "",
    secretAccessKey: env.QUESTBOARD_OFFSITE_SECRET ?? "",
    prefix: (env.QUESTBOARD_OFFSITE_PREFIX ?? "questboard/").replace(/^\/+/, ""),
  };
  return s.endpoint && s.bucket && s.accessKeyId && s.secretAccessKey ? s : null;
}

async function put(s, key, body, contentType) {
  const url = `${s.endpoint}/${s.bucket}/${s.prefix}${key}`;
  const headers = signV4({ method: "PUT", url, headers: { "content-type": contentType, "content-length": body.length }, payloadHash: sha256(body), region: s.region, accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey });
  delete headers.host; // fetch sets it
  const res = await fetch(url, { method: "PUT", headers, body, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`PUT ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

const EMPTY_HASH = sha256("");

async function signedGet(s, pathAndQuery) {
  const url = `${s.endpoint}/${s.bucket}${pathAndQuery}`;
  const headers = signV4({ method: "GET", url, payloadHash: EMPTY_HASH, region: s.region, accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey });
  delete headers.host;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`GET ${pathAndQuery}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

/** Every object key under the prefix (S3 ListObjectsV2, 1000 at a time). */
export async function listOffsite(s, under = "") {
  const keys = [];
  let token = "";
  for (;;) {
    const q = new URLSearchParams({ "list-type": "2", prefix: s.prefix + under, ...(token ? { "continuation-token": token } : {}) });
    const xml = await (await signedGet(s, `?${q}`)).text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(m[1].replace(/&amp;/g, "&"));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (/<NextContinuationToken>([^<]+)</.exec(xml)?.[1] ?? "") : "";
    if (!token) return keys;
  }
}

/** Download the newest backup (unzipped) and the pictures this server doesn't have. */
export async function fetchOffsite({ backupDir, uploadsDir, settings }) {
  const dbKeys = (await listOffsite(settings, "db/")).filter((k) => k.endsWith(".db.gz")).sort(); // names sort by time
  const newest = dbKeys.at(-1);
  if (!newest) throw new Error(`no backup found under ${settings.bucket}/${settings.prefix}db/`);
  mkdirSync(backupDir, { recursive: true });
  const file = join(backupDir, basename(newest).replace(/\.gz$/, ""));
  const obj = (k) => "/" + k.split("/").map(encodeURIComponent).join("/");
  writeFileSync(file, gunzipSync(Buffer.from(await (await signedGet(settings, obj(newest))).arrayBuffer())));
  mkdirSync(uploadsDir, { recursive: true });
  let pictures = 0;
  for (const k of await listOffsite(settings, "uploads/")) {
    const name = basename(k);
    if (existsSync(join(uploadsDir, name))) continue;
    writeFileSync(join(uploadsDir, name), Buffer.from(await (await signedGet(settings, obj(k))).arrayBuffer()));
    pictures++;
  }
  return { file, pictures };
}

/** Upload the newest backup and the pictures not uploaded yet. Returns what was sent. */
export async function uploadOffsite({ backupDir, uploadsDir, settings }) {
  const newest = readdirSync(backupDir).filter((f) => f.endsWith(".db")).map((f) => ({ f, t: statSync(join(backupDir, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!newest) throw new Error(`no backup in ${backupDir} to upload`);
  await put(settings, `db/${newest.f}.gz`, gzipSync(readFileSync(join(backupDir, newest.f))), "application/gzip");
  // Pictures never change once uploaded (random names): send each one once, remembered in a list.
  const sentList = join(backupDir, "offsite-uploads.txt");
  const sent = new Set(existsSync(sentList) ? readFileSync(sentList, "utf8").split("\n").filter(Boolean) : []);
  let pictures = 0;
  if (existsSync(uploadsDir)) {
    for (const f of readdirSync(uploadsDir)) {
      if (sent.has(f) || !statSync(join(uploadsDir, f)).isFile()) continue;
      await put(settings, `uploads/${f}`, readFileSync(join(uploadsDir, f)), "image/webp");
      sent.add(f);
      pictures++;
    }
  }
  writeFileSync(sentList, [...sent].join("\n") + "\n");
  return { backup: basename(newest.f), pictures };
}

/** Remember the outcome for Admin → Setup. */
function record(dbFile, ok, detail) {
  if (!existsSync(dbFile)) return;
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA busy_timeout = 5000");
  const now = new Date().toISOString();
  db.prepare("INSERT INTO app_state (key, value, updated_at) VALUES ('offsite_last', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(JSON.stringify({ at: now, ok, detail: String(detail).slice(0, 300) }), now);
  db.close();
}

async function main(argv) {
  const settings = offsiteSettings();
  if (!settings) {
    console.log("Off-site backups are off: set QUESTBOARD_OFFSITE_ENDPOINT, _BUCKET, _KEY_ID and _SECRET to turn them on.");
    return argv[0] === "fetch" ? 1 : 0;
  }
  const dbFile = process.env.QUESTBOARD_DB ?? "data/questboard.db";
  if (argv[0] === "fetch") {
    try {
      const r = await fetchOffsite({ backupDir: process.env.QUESTBOARD_BACKUP_DIR ?? "data/backups", uploadsDir: process.env.QUESTBOARD_UPLOAD_DIR ?? "data/uploads", settings });
      console.log(`Downloaded ${r.file} and ${r.pictures} picture(s).\nNow stop the app and restore it:\n  node scripts/db-backup.mjs restore ${r.file} --yes`);
      return 0;
    } catch (err) {
      console.error(`Fetching the off-site backup failed: ${err instanceof Error ? err.message : err}`);
      return 1;
    }
  }
  try {
    const r = await uploadOffsite({ backupDir: process.env.QUESTBOARD_BACKUP_DIR ?? "data/backups", uploadsDir: process.env.QUESTBOARD_UPLOAD_DIR ?? "data/uploads", settings });
    record(dbFile, true, `${r.backup} + ${r.pictures} picture(s)`);
    console.log(`Off-site: uploaded ${r.backup} and ${r.pictures} new picture(s) to ${settings.bucket}/${settings.prefix}`);
    return 0;
  } catch (err) {
    record(dbFile, false, err instanceof Error ? err.message : err);
    console.error(`Off-site upload failed: ${err instanceof Error ? err.message : err}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
