// Off-site backups: AWS Signature V4 against AWS's own published example, and the settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { offsiteSettings, signV4 } from "../../scripts/offsite.mjs";

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
  assert.deepEqual(s, { endpoint: "https://x.r2.cloudflarestorage.com", bucket: "qb", region: "auto", accessKeyId: "k", secretAccessKey: "s", prefix: "questboard/" });
});
