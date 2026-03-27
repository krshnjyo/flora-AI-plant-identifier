/**
 * File: backend/lib/admin-audit.ts
 * Purpose: Persist role-aware admin mutation audit events.
 *
 * Responsibilities:
 * - Stores who performed an action, what changed, and whether it succeeded.
 * - Captures request context (IP/user-agent) for forensic traceability.
 * - Fails silently so business operations remain available if logging fails.
 */

import type { NextApiRequest } from "next";
import { getPool } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

type AuditStatus = "success" | "failure";

type AdminAuditInput = {
  action: string;
  targetType: string;
  targetId?: string | number | null;
  status: AuditStatus;
  metadata?: Record<string, unknown> | null;
};

function getRequestIp(req: NextApiRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || "";
  return raw.split(",")[0]?.trim().slice(0, 80) || null;
}

let lastAuditCleanupAt = 0;
const AUDIT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_TELEMETRY_RETENTION_DAYS = 90;

/**
 * Prune old audit/telemetry rows on a throttled cadence.
 *
 * Notes:
 * - Audit rows can honor per-actor retention because they are tied to
 *   `actor_user_id`.
 * - Request telemetry is not user-owned, so we retain a conservative global
 *   default window rather than pretending the per-user retention setting can
 *   be applied there.
 * - Cleanup is best-effort and must never block admin mutations.
 */
async function cleanupExpiredAdminOperationalData() {
  const now = Date.now();
  if (now - lastAuditCleanupAt < AUDIT_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastAuditCleanupAt = now;
  const pool = getPool();

  await pool.execute(
    `DELETE audit_logs
     FROM admin_audit_logs AS audit_logs
     LEFT JOIN user_profiles AS profiles ON profiles.user_id = audit_logs.actor_user_id
     WHERE audit_logs.created_at <
       (UTC_TIMESTAMP() - INTERVAL
         (CASE
            WHEN profiles.audit_retention_days IN (30, 90, 365) THEN profiles.audit_retention_days
            ELSE 90
          END) DAY)`
  );

  await pool.execute(
    `DELETE FROM api_request_telemetry
     WHERE created_at < (UTC_TIMESTAMP() - INTERVAL ? DAY)`,
    [DEFAULT_TELEMETRY_RETENTION_DAYS]
  );
}

export async function recordAdminAudit(req: NextApiRequest, input: AdminAuditInput) {
  try {
    const actor = getUserFromRequest(req);
    const actorRole = actor?.role || "anonymous";

    await getPool().execute(
      `INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, target_type, target_id, status, ip_address, user_agent, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor?.userId ?? null,
        actorRole,
        input.action,
        input.targetType,
        input.targetId !== undefined && input.targetId !== null ? String(input.targetId).slice(0, 120) : null,
        input.status,
        getRequestIp(req),
        String(req.headers["user-agent"] || "").slice(0, 255) || null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );

    await cleanupExpiredAdminOperationalData();
  } catch {
    // Audit logs must never block the request path.
  }
}
