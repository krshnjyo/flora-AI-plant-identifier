/**
 * File: backend/lib/raw-body.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { NextApiRequest } from "next";

const DEFAULT_MAX_BODY_BYTES = 1_000_000;

/**
 * Read and parse a JSON request body when Next bodyParser is disabled.
 */
export async function parseJsonBody<T>(req: NextApiRequest, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<T> {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const normalized = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += normalized.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("Request body too large");
    }
    chunks.push(normalized);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();
  if (!body) {
    throw new Error("Request body is empty");
  }

  return JSON.parse(body) as T;
}
