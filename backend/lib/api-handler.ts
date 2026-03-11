/**
 * File: backend/lib/api-handler.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { getCorsAllowList } from "@/lib/env";
import { sendError } from "@/lib/response";
import { recordApiTelemetry } from "@/lib/telemetry";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalizeOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

function resolveAllowedOrigin(requestOrigin: string | undefined, allowList: string[]) {
  if (!requestOrigin) {
    return allowList[0] || "";
  }

  const normalized = normalizeOrigin(requestOrigin);
  return allowList.includes(normalized) ? normalized : "";
}

function isUnsafeMethod(method: string | undefined) {
  if (!method) return true;
  return !SAFE_METHODS.has(method.toUpperCase());
}

function applyCors(req: NextApiRequest, res: NextApiResponse, methods: string[], allowList: string[]) {
  const requestOrigin = req.headers.origin;
  const allowOrigin = resolveAllowedOrigin(requestOrigin, allowList);

  // Set CORS only when the caller is explicitly allowed.
  if (allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  const normalizedMethods = [...new Set([...methods.map((method) => method.toUpperCase()), "OPTIONS"])];
  res.setHeader("Access-Control-Allow-Methods", normalizedMethods.join(", "));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
}

export function withMethods(methods: string[], handler: NextApiHandler) {
  const allowedMethods = methods.map((method) => method.toUpperCase());

  return async function wrapped(req: NextApiRequest, res: NextApiResponse) {
    const startedAt = Date.now();
    const routePath = String(req.url || "").split("?")[0] || "";
    const allowList = getCorsAllowList();
    try {
      applyCors(req, res, allowedMethods, allowList);

      // CSRF/CORS hardening: deny cross-origin unsafe methods unless the exact origin is allowlisted.
      // Browser-based attacks generally include Origin on unsafe requests.
      if (isUnsafeMethod(req.method) && req.headers.origin) {
        const normalizedOrigin = normalizeOrigin(String(req.headers.origin));
        if (!allowList.includes(normalizedOrigin)) {
          return sendError(res, "FORBIDDEN_ORIGIN", "Origin is not allowed", 403);
        }
      }

      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }

      if (!req.method || !allowedMethods.includes(req.method.toUpperCase())) {
        return sendError(res, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
      }

      try {
        return await handler(req, res);
      } catch (error) {
        // Log once centrally so endpoint handlers remain clean.
        console.error("[api-handler] unhandled error", error);
        return sendError(res, "INTERNAL_ERROR", "Unexpected server error", 500);
      }
    } finally {
      void recordApiTelemetry(req, {
        routePath,
        method: String(req.method || "UNKNOWN"),
        statusCode: Number(res.statusCode || 500),
        durationMs: Date.now() - startedAt
      });
    }
  };
}
