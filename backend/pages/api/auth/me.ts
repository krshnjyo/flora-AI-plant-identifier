/**
 * File: backend/pages/api/auth/me.ts
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
import { requireUser } from "@/lib/auth-guards";
import { sendSuccess } from "@/lib/response";

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  return sendSuccess(res, { user });
});
