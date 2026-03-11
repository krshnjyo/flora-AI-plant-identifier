/**
 * File: backend/lib/telemetry.ts
 * Purpose: API request telemetry helpers for operational monitoring.
 *
 * Responsibilities:
 * - Captures route/method/status/duration for selected high-value endpoints.
 * - Persists user role context and request source metadata.
 * - Operates best-effort to avoid impacting request reliability.
 */

import type { NextApiRequest } from "next";
import { getPool } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

type TelemetryInput = {
  routePath: string;
  method: string;
  statusCode: number;
  durationMs: number;
};

function shouldRecordTelemetry(routePath: string) {
  return routePath.startsWith("/api/admin") || routePath.startsWith("/api/identify");
}

function getRequestIp(req: NextApiRequest) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || "";
  return raw.split(",")[0]?.trim().slice(0, 80) || null;
}

export async function recordApiTelemetry(req: NextApiRequest, input: TelemetryInput) {
  if (!shouldRecordTelemetry(input.routePath)) {
    return;
  }

  try {
    const actor = getUserFromRequest(req);
    const actorRole = actor?.role || "anonymous";

    await getPool().execute(
      `INSERT INTO api_request_telemetry
        (actor_user_id, actor_role, route_path, method, status_code, duration_ms, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor?.userId ?? null,
        actorRole,
        input.routePath.slice(0, 180),
        input.method.slice(0, 10),
        input.statusCode,
        Math.max(0, Math.floor(input.durationMs)),
        getRequestIp(req),
        String(req.headers["user-agent"] || "").slice(0, 255) || null
      ]
    );
  } catch {
    // Telemetry persistence is best-effort only.
  }
}
