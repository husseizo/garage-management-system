import type { NextConfig } from "next";

/**
 * Security headers applied to every response. A strict Content-Security-Policy with nonces will be
 * introduced once third-party scripts (analytics, maps) are known — see docs/architecture/security.md.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Cache Components is disabled for Phase 0: nearly every dashboard view is per-user and
  // request-time. Revisit for the public marketing pages (ADR 0002).
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["pino", "pino-pretty"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
