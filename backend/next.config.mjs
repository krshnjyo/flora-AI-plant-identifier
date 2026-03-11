/**
 * File: backend/next.config.mjs
 * Purpose: Build/runtime configuration module for framework tooling.
 *
 * Responsibilities:
 * - Defines compile-time behavior and framework integration settings
 * - Keeps environment-level defaults in one audited location
 *
 * Design Notes:
 * - Centralized config reduces hidden behavior and deployment drift
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
