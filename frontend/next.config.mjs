/**
 * File: frontend/next.config.mjs
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
function buildRemotePatterns() {
  const defaults = [
    {
      protocol: "http",
      hostname: "localhost",
      port: "4000",
      pathname: "/**"
    },
    {
      protocol: "http",
      hostname: "127.0.0.1",
      port: "4000",
      pathname: "/**"
    }
  ];

  const rawApiBase = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (!rawApiBase) {
    return defaults;
  }

  try {
    const parsed = new URL(rawApiBase);
    const dynamicPattern = {
      protocol: parsed.protocol.replace(/:$/, ""),
      hostname: parsed.hostname,
      pathname: "/**",
      ...(parsed.port ? { port: parsed.port } : {})
    };

    const deduped = new Map(
      [...defaults, dynamicPattern].map((pattern) => [
        `${pattern.protocol}:${pattern.hostname}:${pattern.port || ""}:${pattern.pathname}`,
        pattern
      ])
    );

    return Array.from(deduped.values());
  } catch {
    return defaults;
  }
}

const nextConfig = {
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: buildRemotePatterns()
  },
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
