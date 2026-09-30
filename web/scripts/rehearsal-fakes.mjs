// The production rehearsal's stand-ins for outside services (deploy/rehearsal/): never used for real.
//   POST /emails            like Resend's API: checks the API key, keeps the email
//   PUT  /<bucket>/<key>    like S3: re-checks the Signature V4 of every upload, keeps the object's size
//   GET  /emails, /objects  what arrived, for tests/rehearsal
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { signV4 } from "./offsite.mjs";

const KEY = process.env.RESEND_API_KEY ?? "";
const S3 = { accessKeyId: process.env.QUESTBOARD_OFFSITE_KEY_ID ?? "", secretAccessKey: process.env.QUESTBOARD_OFFSITE_SECRET ?? "", region: process.env.QUESTBOARD_OFFSITE_REGION || "auto" };
const emails = [];
const objects = [];

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
  if (req.method === "PUT") {
    const h = req.headers;
    const payloadHash = createHash("sha256").update(data).digest("hex");
    if (h["x-amz-content-sha256"] !== payloadHash) return json(res, 400, { message: "payload hash mismatch" });
    const d = String(h["x-amz-date"] ?? "");
    const now = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
    const signed = /SignedHeaders=([^,]+)/.exec(String(h.authorization ?? ""))?.[1]?.split(";") ?? [];
    const headers = Object.fromEntries(signed.filter((n) => !["host", "x-amz-date", "x-amz-content-sha256"].includes(n)).map((n) => [n, String(h[n] ?? "")]));
    const expected = signV4({ method: "PUT", url: `http://${h.host}${url.pathname}`, headers, payloadHash, now, ...S3 }).authorization;
    if (expected !== h.authorization) return json(res, 403, { message: "SignatureDoesNotMatch" });
    objects.push({ key: decodeURIComponent(url.pathname.slice(1)), size: data.length, type: h["content-type"] });
    res.writeHead(200);
    return res.end();
  }
  if (req.method === "GET" && url.pathname === "/emails") return json(res, 200, emails);
  if (req.method === "GET" && url.pathname === "/objects") return json(res, 200, objects);
  json(res, 404, { message: "not found" });
}).listen(4000, () => console.log("[fakes] Resend and S3 stand-ins on :4000"));
