import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/csp";

// Evaluated when the app is BUILT: nothing here may depend on production settings (a Docker image is
// built without them). HSTS and the page CSP are sent by src/proxy.ts, per request.
const securityHeaders = [
  // No scripts at all by default; pages replace this with a per-request nonce policy (src/proxy.ts).
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The production image (Dockerfile) builds with QUESTBOARD_STANDALONE=1: only the files the server
  // really uses. Local, e2e and CI servers keep `next start`.
  ...(process.env.QUESTBOARD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Forms may carry an uploaded picture (≤ 5 MB, lib/upload-rules.ts) plus the other fields.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // App art (covers, portraits, textures, app icons): not content-hashed, so a week, then revalidate in the
      // background — repeat visits on slow phones skip a round trip per picture. Uploads are immutable (their route).
      { source: "/:dir(images|textures|icons)/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
