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
import { paginationQuerySchema } from "@/lib/validators";
import { sendError } from "@/lib/response";
import { sendSuccess } from "@/lib/response";

type HistoryRow = {
  scan_id: number;
  plant_name: string | null;
  disease_name: string | null;
  image_url: string | null;
  created_at: string;
};

type HistorySummaryRow = {
  total: number | string;
  with_disease: number | string;
};

type DetectionRow = {
  disease_name: string;
  count: number | string;
};

const DEFAULT_HISTORY_PAGE_SIZE = 50;
const MAX_HISTORY_PAGE_SIZE = 100;

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) {
    return;
  }

  const parsedQuery = paginationQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return sendError(res, "VALIDATION_ERROR", "Invalid history pagination query", 422, parsedQuery.error.flatten());
  }

  const page = parsedQuery.data.page;
  const limit = Math.min(parsedQuery.data.limit || DEFAULT_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE);
  const offset = (page - 1) * limit;
  // This MySQL deployment rejects prepared-statement placeholders inside
  // LIMIT/OFFSET clauses. The values are validated integers above, so embed
  // them directly and keep user_id parameterized.
  const limitClause = `LIMIT ${limit} OFFSET ${offset}`;

  const pool = getPool();
  const [rows, summaryRows, detectionRows] = await Promise.all([
    pool.execute(
      `SELECT scan_id, plant_name, disease_name, image_url, created_at
       FROM scan_history
       WHERE user_id = ?
       ORDER BY created_at DESC
       ${limitClause}`,
      [user.userId]
    ),
    pool.execute(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(disease_name IS NOT NULL AND disease_name <> ''), 0) AS with_disease
       FROM scan_history
       WHERE user_id = ?`,
      [user.userId]
    ),
    pool.execute(
      `SELECT disease_name, COUNT(*) AS count
       FROM scan_history
       WHERE user_id = ?
         AND disease_name IS NOT NULL
         AND disease_name <> ''
       GROUP BY disease_name
       ORDER BY count DESC, disease_name ASC
       LIMIT 6`,
      [user.userId]
    )
  ]);

  const items = rows[0] as HistoryRow[];
  const summary = (summaryRows[0] as HistorySummaryRow[])[0] || { total: 0, with_disease: 0 };
  const total = Number(summary.total || 0);
  const withDisease = Number(summary.with_disease || 0);
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

  return sendSuccess(res, {
    items,
    page,
    limit,
    total,
    totalPages,
    hasMore: page < totalPages,
    summary: {
      total,
      withDisease,
      healthy: Math.max(total - withDisease, 0),
      topDetections: (detectionRows[0] as DetectionRow[]).map((row) => [row.disease_name, Number(row.count || 0)] as const)
    }
  });
});
