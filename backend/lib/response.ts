/**
 * File: backend/lib/response.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { NextApiResponse } from "next";

export type ApiErrorShape = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiSuccessShape<T> = {
  success: true;
  data: T;
};

export function sendSuccess<T>(res: NextApiResponse, data: T, status = 200) {
  return res.status(status).json({ success: true, data } as ApiSuccessShape<T>);
}

export function sendError(
  res: NextApiResponse,
  code: string,
  message: string,
  status = 400,
  details?: unknown
) {
  return res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {})
    }
  } as ApiErrorShape);
}
