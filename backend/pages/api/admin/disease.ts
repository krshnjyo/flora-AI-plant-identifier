/**
 * File: backend/pages/api/admin/disease.ts
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

import fs from "fs/promises";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { withMethods } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/auth-guards";
import { getPool } from "@/lib/db";
import { diseaseAdminSchema } from "@/lib/validators";
import { runDiseaseAssetUpload } from "@/lib/upload";
import { sendError, sendSuccess } from "@/lib/response";
import { parseJsonBody } from "@/lib/raw-body";
import { invalidateDiseaseJsonCache, readDiseaseJson, resolveDiseaseJsonPath } from "@/lib/disease-json";
import { backendPath } from "@/lib/backend-root";
import { recordAdminAudit } from "@/lib/admin-audit";
import { bumpCacheVersion } from "@/lib/request-cache";

export const config = {
  api: {
    bodyParser: false
  }
};

const diseaseDeleteSchema = z.object({
  diseaseId: z.number().int().positive(),
  jsonFile: z.string().trim().min(5).max(255).optional(),
  deleteJsonFile: z.boolean().optional().default(false)
});

type UploadedAsset = {
  path: string;
  originalname: string;
  filename: string;
};

function toFileSafeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "disease";
}

function splitSpeciesTokens(raw: string) {
  return raw
    .split(/[,/|;]/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

async function resolvePrimaryPlantId(affectedSpecies: string, explicitPrimaryPlantId: number | null) {
  if (explicitPrimaryPlantId && explicitPrimaryPlantId > 0) {
    return explicitPrimaryPlantId;
  }

  const speciesTokens = Array.from(
    new Set(
      splitSpeciesTokens(affectedSpecies)
        .map((token) => token.toLowerCase())
        .filter(Boolean)
    )
  );
  if (speciesTokens.length === 0) {
    return null;
  }

  const pool = getPool();
  const placeholders = speciesTokens.map(() => "?").join(", ");
  try {
    const [rows] = await pool.execute(
      `SELECT plant_id
       FROM plants
       WHERE common_name_norm IN (${placeholders})
          OR scientific_name_norm IN (${placeholders})
          OR species_norm IN (${placeholders})
       LIMIT 1`,
      [...speciesTokens, ...speciesTokens, ...speciesTokens]
    );
    const row = (rows as Array<{ plant_id: number }>)[0];
    if (row?.plant_id) return row.plant_id;
  } catch (error) {
    const code = (error as { code?: string }).code || "";
    if (!["ER_BAD_FIELD_ERROR", "ER_PARSE_ERROR"].includes(code)) {
      throw error;
    }

    const [rows] = await pool.execute(
      `SELECT plant_id
       FROM plants
       WHERE LOWER(common_name) IN (${placeholders})
          OR LOWER(scientific_name) IN (${placeholders})
          OR LOWER(species) IN (${placeholders})
       LIMIT 1`,
      [...speciesTokens, ...speciesTokens, ...speciesTokens]
    );
    const row = (rows as Array<{ plant_id: number }>)[0];
    if (row?.plant_id) return row.plant_id;
  }

  return null;
}

function isProcedureMismatchError(error: unknown) {
  return ["ER_SP_DOES_NOT_EXIST", "ER_SP_WRONG_NO_OF_ARGS", "ER_BAD_FIELD_ERROR"].includes(
    (error as { code?: string }).code || ""
  );
}

async function callAdminDiseaseProcedure(sql: string, params: Array<number | string | null>) {
  await getPool().query(sql, params);
}

async function upsertDiseaseDirect(
  diseaseId: number | null,
  diseaseName: string,
  affectedSpecies: string,
  diseaseDescription: string,
  symptoms: string,
  causes: string,
  preventionMethods: string,
  treatmentMethods: string,
  severityLevel: string,
  jsonFile: string | null,
  primaryPlantId: number | null
) {
  if (!diseaseId) {
    await getPool().execute(
      `INSERT INTO plant_diseases (
         disease_name,
         affected_species,
         disease_description,
         symptoms,
         causes,
         prevention_methods,
         treatment_methods,
         severity_level,
         json_file,
         primary_plant_id
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         affected_species = VALUES(affected_species),
         disease_description = VALUES(disease_description),
         symptoms = VALUES(symptoms),
         causes = VALUES(causes),
         prevention_methods = VALUES(prevention_methods),
         treatment_methods = VALUES(treatment_methods),
         severity_level = VALUES(severity_level),
         json_file = VALUES(json_file),
         primary_plant_id = VALUES(primary_plant_id)`,
      [
        diseaseName,
        affectedSpecies,
        diseaseDescription,
        symptoms,
        causes,
        preventionMethods,
        treatmentMethods,
        severityLevel,
        jsonFile,
        primaryPlantId
      ]
    );
    return;
  }

  await getPool().execute(
    `UPDATE plant_diseases
     SET disease_name = ?,
         affected_species = ?,
         disease_description = ?,
         symptoms = ?,
         causes = ?,
         prevention_methods = ?,
         treatment_methods = ?,
         severity_level = ?,
         json_file = ?,
         primary_plant_id = ?
     WHERE disease_id = ?`,
    [
      diseaseName,
      affectedSpecies,
      diseaseDescription,
      symptoms,
      causes,
      preventionMethods,
      treatmentMethods,
      severityLevel,
      jsonFile,
      primaryPlantId,
      diseaseId
    ]
  );
}

async function deleteDiseaseDirect(diseaseId: number) {
  await getPool().execute("DELETE FROM plant_diseases WHERE disease_id = ?", [diseaseId]);
}

async function upsertDiseaseWithFallback(
  diseaseId: number | null,
  diseaseName: string,
  affectedSpecies: string,
  diseaseDescription: string,
  symptoms: string,
  causes: string,
  preventionMethods: string,
  treatmentMethods: string,
  severityLevel: string,
  jsonFile: string | null,
  primaryPlantId: number | null
) {
  try {
    await callAdminDiseaseProcedure("CALL sp_upsert_disease(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      diseaseId,
      diseaseName,
      affectedSpecies,
      diseaseDescription,
      symptoms,
      causes,
      preventionMethods,
      treatmentMethods,
      severityLevel,
      jsonFile,
      primaryPlantId
    ]);
  } catch (error) {
    if (!isProcedureMismatchError(error)) {
      throw error;
    }
    await upsertDiseaseDirect(
      diseaseId,
      diseaseName,
      affectedSpecies,
      diseaseDescription,
      symptoms,
      causes,
      preventionMethods,
      treatmentMethods,
      severityLevel,
      jsonFile,
      primaryPlantId
    );
  }
}

async function deleteDiseaseWithFallback(diseaseId: number) {
  try {
    await callAdminDiseaseProcedure("CALL sp_delete_disease(?)", [diseaseId]);
  } catch (error) {
    if (!isProcedureMismatchError(error)) {
      throw error;
    }
    await deleteDiseaseDirect(diseaseId);
  }
}

export default withMethods(["POST", "PUT", "DELETE"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }

  const audit = (input: Parameters<typeof recordAdminAudit>[1]) => recordAdminAudit(req, input);

  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  const isMultipart = contentType.includes("multipart/form-data");

  if (req.method === "POST") {
    let source: Record<string, unknown> = {};
    let jsonFile = "";

    if (isMultipart) {
      try {
        await runDiseaseAssetUpload(req, res);
      } catch (error) {
        return sendError(res, "UPLOAD_ERROR", (error as Error).message, 400);
      }

      source = req.body as Record<string, unknown>;

      const uploadedFiles = ((req as NextApiRequest & { files?: Record<string, UploadedAsset[]> }).files || {}) as Record<string, UploadedAsset[]>;
      const jsonUpload = uploadedFiles.jsonFileUpload?.[0];
      if (jsonUpload) {
        const diseaseNameHint = String(source.diseaseName || "").trim() || jsonUpload.originalname;
        const safeName = toFileSafeToken(diseaseNameHint);
        const jsonFileName = `${Date.now()}-${safeName}-${jsonUpload.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const destDir = backendPath("data", "diseases");
        await fs.mkdir(destDir, { recursive: true });
        const destPath = path.join(destDir, jsonFileName);
        await fs.rename(jsonUpload.path, destPath);
        jsonFile = path.join("data", "diseases", jsonFileName).replace(/\\/g, "/");
      }
    } else {
      try {
        source = (await parseJsonBody(req)) as Record<string, unknown>;
      } catch (error) {
        if (error instanceof Error && error.message === "Request body too large") {
          return sendError(res, "PAYLOAD_TOO_LARGE", "Request body is too large", 413);
        }
        return sendError(res, "INVALID_JSON", "Invalid JSON body", 400);
      }
    }

    if (!jsonFile) {
      jsonFile = String(source.jsonFile || "").trim();
    }

    let payload = {
      diseaseName: String(source.diseaseName || "").trim(),
      affectedSpecies: String(source.affectedSpecies || "").trim(),
      diseaseDescription: String(source.diseaseDescription || "").trim(),
      symptoms: String(source.symptoms || "").trim(),
      causes: String(source.causes || "").trim(),
      preventionMethods: String(source.preventionMethods || "").trim(),
      treatmentMethods: String(source.treatmentMethods || "").trim(),
      severityLevel: String(source.severityLevel || "").trim(),
      jsonFile: jsonFile || undefined,
      primaryPlantId: Number(source.primaryPlantId || 0) || null
    };

      if (jsonFile) {
        try {
          const diseaseJson = await readDiseaseJson(jsonFile);
        payload = {
          diseaseName: payload.diseaseName || diseaseJson.disease_name,
          affectedSpecies: payload.affectedSpecies || diseaseJson.affected_species,
          diseaseDescription: payload.diseaseDescription || diseaseJson.disease_description,
          symptoms: payload.symptoms || diseaseJson.symptoms,
          causes: payload.causes || diseaseJson.causes,
          preventionMethods: payload.preventionMethods || diseaseJson.prevention_methods,
          treatmentMethods: payload.treatmentMethods || diseaseJson.treatment_methods,
          severityLevel: payload.severityLevel || diseaseJson.severity_level,
          jsonFile,
          primaryPlantId: payload.primaryPlantId
          };
        } catch {
          await audit({
            action: "disease.create",
            targetType: "disease",
            targetId: payload.diseaseName || null,
            status: "failure",
            metadata: { reason: "invalid_json_schema" }
          });
          return sendError(res, "INVALID_DISEASE_JSON", "Uploaded JSON does not match required disease structure", 422);
        }
      }

      const parsed = diseaseAdminSchema.safeParse(payload);
      if (!parsed.success) {
        await audit({
          action: "disease.create",
          targetType: "disease",
          status: "failure",
          metadata: { reason: "validation_error" }
        });
        return sendError(res, "VALIDATION_ERROR", "Invalid disease payload", 422, parsed.error.flatten());
      }

    const primaryPlantId = await resolvePrimaryPlantId(parsed.data.affectedSpecies, parsed.data.primaryPlantId ?? null);

    await upsertDiseaseWithFallback(
      null,
      parsed.data.diseaseName,
      parsed.data.affectedSpecies,
      parsed.data.diseaseDescription,
      parsed.data.symptoms,
      parsed.data.causes,
      parsed.data.preventionMethods,
      parsed.data.treatmentMethods,
      parsed.data.severityLevel,
      parsed.data.jsonFile || jsonFile || null,
      primaryPlantId
    );

      invalidateDiseaseJsonCache();
      await bumpCacheVersion("diseases");
      await audit({
        action: "disease.create",
        targetType: "disease",
        targetId: parsed.data.diseaseName,
        status: "success",
        metadata: { jsonFile: parsed.data.jsonFile || jsonFile || null, primaryPlantId }
      });
      return sendSuccess(res, { message: "Disease created", jsonFile: jsonFile || null }, 201);
    }

  let body: unknown;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === "Request body too large") {
      return sendError(res, "PAYLOAD_TOO_LARGE", "Request body is too large", 413);
    }
    return sendError(res, "INVALID_JSON", "Invalid JSON body", 400);
  }

  if (req.method === "DELETE") {
    const parsedDelete = diseaseDeleteSchema.safeParse(body);
    if (!parsedDelete.success) {
      await audit({
        action: "disease.delete",
        targetType: "disease",
        status: "failure",
        metadata: { reason: "validation_error" }
      });
      return sendError(res, "VALIDATION_ERROR", "diseaseId is required for delete", 422, parsedDelete.error.flatten());
    }

    await deleteDiseaseWithFallback(parsedDelete.data.diseaseId);

    if (parsedDelete.data.deleteJsonFile && parsedDelete.data.jsonFile) {
      try {
        const jsonAbsolutePath = resolveDiseaseJsonPath(parsedDelete.data.jsonFile);
        await fs.unlink(jsonAbsolutePath);
      } catch {
        // JSON file cleanup is best-effort; DB delete succeeded already.
      }
    }

    invalidateDiseaseJsonCache();
    await bumpCacheVersion("diseases");
    await audit({
      action: "disease.delete",
      targetType: "disease",
      targetId: parsedDelete.data.diseaseId,
      status: "success",
      metadata: {
        deletedJson: Boolean(parsedDelete.data.deleteJsonFile && parsedDelete.data.jsonFile)
      }
    });
    return sendSuccess(res, { message: "Disease deleted" });
  }

  const source = body as Record<string, unknown>;
  const diseaseId = Number(source.diseaseId || 0);
  if (!diseaseId) {
    await audit({
      action: "disease.update",
      targetType: "disease",
      status: "failure",
      metadata: { reason: "missing_disease_id" }
    });
    return sendError(res, "VALIDATION_ERROR", "diseaseId is required for updates", 422);
  }

  const jsonFile = String(source.jsonFile || "").trim();
  let payload = {
    diseaseName: String(source.diseaseName || "").trim(),
    affectedSpecies: String(source.affectedSpecies || "").trim(),
    diseaseDescription: String(source.diseaseDescription || "").trim(),
    symptoms: String(source.symptoms || "").trim(),
    causes: String(source.causes || "").trim(),
    preventionMethods: String(source.preventionMethods || "").trim(),
    treatmentMethods: String(source.treatmentMethods || "").trim(),
    severityLevel: String(source.severityLevel || "").trim(),
    jsonFile: jsonFile || undefined,
    primaryPlantId: Number(source.primaryPlantId || 0) || null
  };

  if (jsonFile) {
    try {
      const diseaseJson = await readDiseaseJson(jsonFile);
      payload = {
        diseaseName: payload.diseaseName || diseaseJson.disease_name,
        affectedSpecies: payload.affectedSpecies || diseaseJson.affected_species,
        diseaseDescription: payload.diseaseDescription || diseaseJson.disease_description,
        symptoms: payload.symptoms || diseaseJson.symptoms,
        causes: payload.causes || diseaseJson.causes,
        preventionMethods: payload.preventionMethods || diseaseJson.prevention_methods,
        treatmentMethods: payload.treatmentMethods || diseaseJson.treatment_methods,
        severityLevel: payload.severityLevel || diseaseJson.severity_level,
        jsonFile,
        primaryPlantId: payload.primaryPlantId
      };
    } catch {
      await audit({
        action: "disease.update",
        targetType: "disease",
        targetId: diseaseId,
        status: "failure",
        metadata: { reason: "invalid_json_schema" }
      });
      return sendError(res, "INVALID_DISEASE_JSON", "Referenced JSON file is missing or invalid", 422);
    }
  }

  const parsed = diseaseAdminSchema.safeParse(payload);
  if (!parsed.success) {
    await audit({
      action: "disease.update",
      targetType: "disease",
      targetId: diseaseId,
      status: "failure",
      metadata: { reason: "validation_error" }
    });
    return sendError(res, "VALIDATION_ERROR", "Invalid disease payload", 422, parsed.error.flatten());
  }

  const primaryPlantId = await resolvePrimaryPlantId(parsed.data.affectedSpecies, parsed.data.primaryPlantId ?? null);

  await upsertDiseaseWithFallback(
    diseaseId,
    parsed.data.diseaseName,
    parsed.data.affectedSpecies,
    parsed.data.diseaseDescription,
    parsed.data.symptoms,
    parsed.data.causes,
    parsed.data.preventionMethods,
    parsed.data.treatmentMethods,
    parsed.data.severityLevel,
    parsed.data.jsonFile || jsonFile || null,
    primaryPlantId
  );

  invalidateDiseaseJsonCache();
  await bumpCacheVersion("diseases");
  await audit({
    action: "disease.update",
    targetType: "disease",
    targetId: diseaseId,
    status: "success",
    metadata: { jsonFile: parsed.data.jsonFile || jsonFile || null, primaryPlantId }
  });
  return sendSuccess(res, { message: "Disease updated" });
});
