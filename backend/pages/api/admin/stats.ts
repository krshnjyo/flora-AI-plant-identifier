/**
 * File: backend/pages/api/admin/stats.ts
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
import { requireAdmin } from "@/lib/auth-guards";
import { getPool } from "@/lib/db";
import { sendSuccess } from "@/lib/response";

type CountRow = { count: number };
type RecentRow = {
  scan_id: number;
  plant_name: string | null;
  disease_name: string | null;
  image_url: string | null;
  created_at: string;
};
type AuditSummaryRow = {
  total: number;
  failures: number;
};
type TelemetrySummaryRow = {
  total_requests: number;
  avg_duration_ms: number | null;
  max_duration_ms: number | null;
  error_requests: number;
};
type TelemetryRouteRow = {
  route_path: string;
  hits: number;
  avg_duration_ms: number | null;
};
type RecentAuditRow = {
  audit_id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  status: "success" | "failure";
  actor_role: "anonymous" | "user" | "admin";
  created_at: string;
};

async function executeRowsOrDefault<T>(sql: string, fallback: T[]): Promise<T[]> {
  try {
    const [rows] = await getPool().execute(sql);
    return rows as T[];
  } catch (error) {
    const code = (error as { code?: string }).code || "";
    if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_PARSE_ERROR", "42P01", "42703", "42601"].includes(code)) {
      return fallback;
    }
    throw error;
  }
}

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }

  const [plantCountRows, diseaseCountRows, scanCountRows, recentRows, auditSummaryRows, telemetrySummaryRows, telemetryRouteRows, recentAuditRows] =
    await Promise.all([
      executeRowsOrDefault<CountRow>("SELECT COUNT(*)::int AS count FROM plants", [{ count: 0 }]),
      executeRowsOrDefault<CountRow>("SELECT COUNT(*)::int AS count FROM plant_diseases", [{ count: 0 }]),
      executeRowsOrDefault<CountRow>("SELECT COUNT(*)::int AS count FROM scan_history", [{ count: 0 }]),
      executeRowsOrDefault<RecentRow>(
        `SELECT scan_id, plant_name, disease_name, image_url, created_at
         FROM scan_history
         ORDER BY created_at DESC
         LIMIT 10`,
        []
      ),
      executeRowsOrDefault<AuditSummaryRow>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'failure')::int AS failures
         FROM admin_audit_logs
         WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours')`,
        [{ total: 0, failures: 0 }]
      ),
      executeRowsOrDefault<TelemetrySummaryRow>(
        `SELECT COUNT(*)::int AS total_requests,
                ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms,
                MAX(duration_ms) AS max_duration_ms,
                COUNT(*) FILTER (WHERE status_code >= 400)::int AS error_requests
         FROM api_request_telemetry
         WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours')`,
        [{ total_requests: 0, avg_duration_ms: 0, max_duration_ms: 0, error_requests: 0 }]
      ),
      executeRowsOrDefault<TelemetryRouteRow>(
        `SELECT route_path, COUNT(*)::int AS hits, ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms
         FROM api_request_telemetry
         WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours')
         GROUP BY route_path
         ORDER BY hits DESC
         LIMIT 8`,
        []
      ),
      executeRowsOrDefault<RecentAuditRow>(
        `SELECT audit_id, action, target_type, target_id, status, actor_role, created_at
         FROM admin_audit_logs
         ORDER BY created_at DESC
         LIMIT 20`,
        []
      )
    ]);

  return sendSuccess(res, {
    totalPlants: (plantCountRows as CountRow[])[0]?.count || 0,
    totalDiseases: (diseaseCountRows as CountRow[])[0]?.count || 0,
    totalScans: (scanCountRows as CountRow[])[0]?.count || 0,
    recentUploads: recentRows as RecentRow[],
    telemetry: {
      adminAudit24h: (auditSummaryRows as AuditSummaryRow[])[0] || { total: 0, failures: 0 },
      request24h: (telemetrySummaryRows as TelemetrySummaryRow[])[0] || {
        total_requests: 0,
        avg_duration_ms: 0,
        max_duration_ms: 0,
        error_requests: 0
      },
      topRoutes24h: telemetryRouteRows as TelemetryRouteRow[],
      recentAudits: recentAuditRows as RecentAuditRow[]
    }
  });
});
