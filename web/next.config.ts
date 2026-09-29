import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/lib/csp";

const securityHeaders = [
  // No scripts at all by default; pages replace this with a per-request nonce policy (src/proxy.ts).
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.QUESTBOARD_ENFORCE_HTTPS === "true"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
