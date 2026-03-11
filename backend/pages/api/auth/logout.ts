/**
 * File: backend/pages/api/auth/logout.ts
 * Purpose: Defines an HTTP API route for the backend service.
 *
 * Responsibilities:
 * - Validates request input and route-specific query/body values
 * - Coordinates DB/service helpers to produce deterministic JSON responses
 * - Returns user-safe error messages while preserving operational stability
 *
 * Design Notes:
 * - Keeps controller logic thin by delegating reusable logic to lib helpers
 * - Uses consistent response envelope shapes so frontend handling is predictable
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { clearAuthCookie } from "@/lib/auth";
import { sendSuccess } from "@/lib/response";

export default withMethods(["POST"], async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Set-Cookie", clearAuthCookie());
  return sendSuccess(res, { message: "Logged out" });
});
