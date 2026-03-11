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
  } catch {
    // Audit logs must never block the request path.
  }
}
