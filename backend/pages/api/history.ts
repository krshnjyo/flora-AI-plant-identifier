/**
 * File: backend/pages/api/history.ts
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
import { getPool } from "@/lib/db";
import { sendSuccess } from "@/lib/response";

type HistoryRow = {
  scan_id: number;
  plant_name: string | null;
  disease_name: string | null;
  image_url: string | null;
  created_at: string;
};

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const [rows] = await getPool().execute(
    `SELECT scan_id, plant_name, disease_name, image_url, created_at
     FROM scan_history
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 100`,
    [user.userId]
  );

  return sendSuccess(res, rows as HistoryRow[]);
});
