/**
 * File: backend/pages/api/admin/relations.ts
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

import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/auth-guards";
import { getPool } from "@/lib/db";
import { parseJsonBody } from "@/lib/raw-body";
import { sendError, sendSuccess } from "@/lib/response";
import { recordAdminAudit } from "@/lib/admin-audit";

const relationSchema = z.object({
  plantId: z.number().int().positive(),
  diseaseId: z.number().int().positive(),
  relationType: z.enum(["common", "primary", "possible"]).optional().default("common"),
  source: z.enum(["json", "admin", "inference"]).optional().default("admin")
});

const unlinkSchema = z.object({
  plantId: z.number().int().positive(),
  diseaseId: z.number().int().positive()
});

export default withMethods(["POST", "DELETE"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }

  const audit = (input: Parameters<typeof recordAdminAudit>[1]) => recordAdminAudit(req, input);

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch {
    return sendError(res, "INVALID_JSON", "Invalid JSON body", 400);
  }

  if (req.method === "POST") {
    const parsed = relationSchema.safeParse(body);
    if (!parsed.success) {
      await audit({
        action: "relation.link",
        targetType: "plant_disease_map",
        status: "failure",
        metadata: { reason: "validation_error" }
      });
      return sendError(res, "VALIDATION_ERROR", "Invalid relation payload", 422, parsed.error.flatten());
    }

    await getPool().execute(
      `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         relation_type = VALUES(relation_type),
         source = VALUES(source)`,
      [parsed.data.plantId, parsed.data.diseaseId, parsed.data.relationType, parsed.data.source]
    );

    await audit({
      action: "relation.link",
      targetType: "plant_disease_map",
      targetId: `${parsed.data.plantId}:${parsed.data.diseaseId}`,
      status: "success",
      metadata: { relationType: parsed.data.relationType, source: parsed.data.source }
    });
    return sendSuccess(res, { message: "Plant-disease link saved" });
  }

  const parsedDelete = unlinkSchema.safeParse(body);
  if (!parsedDelete.success) {
    await audit({
      action: "relation.unlink",
      targetType: "plant_disease_map",
      status: "failure",
      metadata: { reason: "validation_error" }
    });
    return sendError(res, "VALIDATION_ERROR", "Invalid unlink payload", 422, parsedDelete.error.flatten());
  }

  await getPool().execute(
    "DELETE FROM plant_disease_map WHERE plant_id = ? AND disease_id = ?",
    [parsedDelete.data.plantId, parsedDelete.data.diseaseId]
  );

  await audit({
    action: "relation.unlink",
    targetType: "plant_disease_map",
    targetId: `${parsedDelete.data.plantId}:${parsedDelete.data.diseaseId}`,
    status: "success"
  });
  return sendSuccess(res, { message: "Plant-disease link removed" });
});
