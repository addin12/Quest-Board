import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Content Security Policy without nonces (see Next's CSP guide, "Without Nonces").
// Everything is self-hosted (next/font, subset icon font), so 'self' is enough.
// 'unsafe-inline' is required for Next's inline bootstrap scripts without nonces;
// dev additionally needs 'unsafe-eval' (React Refresh) and websockets (HMR).
// Set QUESTBOARD_ENFORCE_HTTPS=true behind TLS to also upgrade insecure requests.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.QUESTBOARD_ENFORCE_HTTPS === "true" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
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
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
