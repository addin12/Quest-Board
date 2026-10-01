// Off-site backups: AWS Signature V4 against AWS's own published example, and the settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { backupsToDelete, offsiteSettings, signV4 } from "../../scripts/offsite.mjs";

test("SigV4 matches AWS's example (S3 GET Object with a Range header)", () => {
  // docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html — "Example: GET Object"
  const h = signV4({
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    headers: { range: "bytes=0-9" },
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    now: new Date("2013-05-24T00:00:00Z"),
  });
  assert.equal(
    h.authorization,
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
  assert.equal(h["x-amz-date"], "20130524T000000Z");
});

test("off-site copies are on only when fully configured", () => {
  assert.equal(offsiteSettings({}), null);
  assert.equal(offsiteSettings({ QUESTBOARD_OFFSITE_ENDPOINT: "https://x.r2.cloudflarestorage.com", QUESTBOARD_OFFSITE_BUCKET: "b" }), null);
  const s = offsiteSettings({ QUESTBOARD_OFFSITE_ENDPOINT: "https://x.r2.cloudflarestorage.com/", QUESTBOARD_OFFSITE_BUCKET: "qb", QUESTBOARD_OFFSITE_KEY_ID: "k", QUESTBOARD_OFFSITE_SECRET: "s" });
  assert.deepEqual(s, { endpoint: "https://x.r2.cloudflarestorage.com", bucket: "qb", region: "auto", accessKeyId: "k", secretAccessKey: "s", prefix: "questboard/", keepDays: 60 });
});

test("old database copies are deleted after the kept days — never the newest 3, never pictures", () => {
  const now = Date.parse("2026-10-10T00:00:00Z");
  const day = 86_400_000;
  const copy = (name: string, daysAgo: number) => ({ key: `questboard/db/questboard-${name}.db.gz`, size: 1, modified: new Date(now - daysAgo * day).toISOString() });
  const objects = [
    copy("20261009-200000", 1), copy("20261008-200000", 2), copy("20260801-200000", 70), copy("20260701-200000", 100),
    { key: "questboard/uploads/abc.webp", size: 1, modified: new Date(now - 400 * day).toISOString() },
  ];
  assert.deepEqual(backupsToDelete(objects, 60, now), ["questboard/db/questboard-20260701-200000.db.gz"]); // the 70-day one is among the newest 3
  assert.deepEqual(backupsToDelete(objects, 60, now, 2).sort(), ["questboard/db/questboard-20260701-200000.db.gz", "questboard/db/questboard-20260801-200000.db.gz"]);
  assert.deepEqual(backupsToDelete(objects, 0, now), []); // keep everything
  assert.equal(offsiteSettings({ QUESTBOARD_OFFSITE_ENDPOINT: "https://x", QUESTBOARD_OFFSITE_BUCKET: "b", QUESTBOARD_OFFSITE_KEY_ID: "k", QUESTBOARD_OFFSITE_SECRET: "s" })!.keepDays, 60);
  assert.equal(offsiteSettings({ QUESTBOARD_OFFSITE_ENDPOINT: "https://x", QUESTBOARD_OFFSITE_BUCKET: "b", QUESTBOARD_OFFSITE_KEY_ID: "k", QUESTBOARD_OFFSITE_SECRET: "s", QUESTBOARD_OFFSITE_KEEP_DAYS: "0" })!.keepDays, 0);
});
