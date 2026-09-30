// The production rehearsal's stand-ins for outside services (deploy/rehearsal/): never used for real.
//   POST /emails            like Resend's API: checks the API key, keeps the email
//   PUT  /<bucket>/<key>    like S3: re-checks the Signature V4 of every upload and keeps the object
//   GET  /<bucket>?list-type=2&prefix=…, GET /<bucket>/<key>   like S3: list and download (signed too)
//   GET  /emails, /objects  what arrived, for tests/rehearsal
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { signV4 } from "./offsite.mjs";

const KEY = process.env.RESEND_API_KEY ?? "";
const S3 = { accessKeyId: process.env.QUESTBOARD_OFFSITE_KEY_ID ?? "", secretAccessKey: process.env.QUESTBOARD_OFFSITE_SECRET ?? "", region: process.env.QUESTBOARD_OFFSITE_REGION || "auto" };
const emails = [];
const objects = []; // { key, size, type, data }

/** The signature a request should carry (the same signer the app uses; AWS's example checks it). */
function signatureOk(req, url, payloadHash) {
  const h = req.headers;
  const d = String(h["x-amz-date"] ?? "");
  const now = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
  const signed = /SignedHeaders=([^,]+)/.exec(String(h.authorization ?? ""))?.[1]?.split(";") ?? [];
  const headers = Object.fromEntries(signed.filter((n) => !["host", "x-amz-date", "x-amz-content-sha256"].includes(n)).map((n) => [n, String(h[n] ?? "")]));
  return signV4({ method: req.method, url: `http://${h.host}${url.pathname}${url.search}`, headers, payloadHash, now, ...S3 }).authorization === h.authorization;
}
const xmlEscape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const body = (req) => new Promise((ok) => { const parts = []; req.on("data", (c) => parts.push(c)); req.on("end", () => ok(Buffer.concat(parts))); });
const json = (res, status, data) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://fakes");
  const data = await body(req);
  if (req.method === "POST" && url.pathname === "/emails") {
    if (req.headers.authorization !== `Bearer ${KEY}`) return json(res, 401, { message: "bad API key" });
    const mail = JSON.parse(data.toString("utf8"));
    emails.push({ ...mail, at: new Date().toISOString() });
    return json(res, 200, { id: `fake-${emails.length}` });
  }
  if (req.method === "GET" && url.pathname === "/emails") return json(res, 200, emails);
  if (req.method === "GET" && url.pathname === "/objects") return json(res, 200, objects.map((o) => ({ key: o.key, size: o.size, type: o.type })));
  if (req.method === "PUT" || (req.method === "GET" && req.headers.authorization)) {
    const payloadHash = createHash("sha256").update(data).digest("hex");
    if (req.headers["x-amz-content-sha256"] !== payloadHash) return json(res, 400, { message: "payload hash mismatch" });
    if (!signatureOk(req, url, payloadHash)) return json(res, 403, { message: "SignatureDoesNotMatch" });
    const path = decodeURIComponent(url.pathname.slice(1)); // "<bucket>" or "<bucket>/<key>"
    if (req.method === "PUT") {
      const i = objects.findIndex((o) => o.key === path);
      const o = { key: path, size: data.length, type: req.headers["content-type"], data };
      if (i >= 0) objects[i] = o; else objects.push(o);
      res.writeHead(200);
      return res.end();
    }
    if (url.searchParams.get("list-type") === "2") {
      const bucket = path.split("/")[0];
      const prefix = url.searchParams.get("prefix") ?? "";
      const keys = objects.filter((o) => o.key.startsWith(`${bucket}/${prefix}`)).map((o) => o.key.slice(bucket.length + 1));
      res.writeHead(200, { "content-type": "application/xml" });
      return res.end(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${xmlEscape(k)}</Key></Contents>`).join("")}</ListBucketResult>`);
    }
    const o = objects.find((x) => x.key === path);
    if (!o) return json(res, 404, { message: "NoSuchKey" });
    res.writeHead(200, { "content-type": o.type ?? "application/octet-stream" });
    return res.end(o.data);
  }
  json(res, 404, { message: "not found" });
}).listen(4000, () => console.log("[fakes] Resend and S3 stand-ins on :4000"));
