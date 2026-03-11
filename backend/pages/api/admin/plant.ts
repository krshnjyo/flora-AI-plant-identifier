/**
 * File: backend/pages/api/admin/plant.ts
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
import { plantAdminSchema } from "@/lib/validators";
import { runPlantAssetUpload } from "@/lib/upload";
import { sendError, sendSuccess } from "@/lib/response";
import { parseJsonBody } from "@/lib/raw-body";
import { invalidatePlantJsonCache, readPlantJson, resolvePlantJsonPath } from "@/lib/plant-json";
import { backendPath } from "@/lib/backend-root";
import { recordAdminAudit } from "@/lib/admin-audit";
import { bumpCacheVersion } from "@/lib/request-cache";

export const config = {
  api: {
    bodyParser: false
  }
};

const plantDeleteSchema = z.object({
  plantId: z.number().int().positive()
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
    .replace(/^_+|_+$/g, "") || "plant";
}

async function applyImageUrlToPlantJson(jsonFile: string, imageUrl: string) {
  const jsonAbsolutePath = resolvePlantJsonPath(jsonFile);
  const content = await fs.readFile(jsonAbsolutePath, "utf8");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  parsed.image_url = imageUrl;
  await fs.writeFile(jsonAbsolutePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function isProcedureMismatchError(error: unknown) {
  return ["ER_SP_DOES_NOT_EXIST", "ER_SP_WRONG_NO_OF_ARGS", "ER_BAD_FIELD_ERROR"].includes(
    (error as { code?: string }).code || ""
  );
}

async function callAdminPlantProcedure(sql: string, params: Array<number | string | null>) {
  await getPool().query(sql, params);
}

async function upsertPlantDirect(
  plantId: number | null,
  commonName: string,
  scientificName: string,
  species: string,
  confidenceScore: number,
  jsonFile: string
) {
  if (!plantId) {
    await getPool().execute(
      `INSERT INTO plants (common_name, scientific_name, species, confidence_score, json_file)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         common_name = VALUES(common_name),
         species = VALUES(species),
         confidence_score = VALUES(confidence_score),
         json_file = VALUES(json_file)`,
      [commonName, scientificName, species, confidenceScore, jsonFile]
    );
    return;
  }

  await getPool().execute(
    `UPDATE plants
     SET common_name = ?,
         scientific_name = ?,
         species = ?,
         confidence_score = ?,
         json_file = ?
     WHERE plant_id = ?`,
    [commonName, scientificName, species, confidenceScore, jsonFile, plantId]
  );
}

async function deletePlantDirect(plantId: number) {
  await getPool().execute("DELETE FROM plants WHERE plant_id = ?", [plantId]);
}

async function upsertPlantWithFallback(
  plantId: number | null,
  commonName: string,
  scientificName: string,
  species: string,
  confidenceScore: number,
  jsonFile: string
) {
  try {
    await callAdminPlantProcedure("CALL sp_upsert_plant(?, ?, ?, ?, ?, ?)", [
      plantId,
      commonName,
      scientificName,
      species,
      confidenceScore,
      jsonFile
    ]);
  } catch (error) {
    if (!isProcedureMismatchError(error)) {
      throw error;
    }
    await upsertPlantDirect(plantId, commonName, scientificName, species, confidenceScore, jsonFile);
  }
}

async function deletePlantWithFallback(plantId: number) {
  try {
    await callAdminPlantProcedure("CALL sp_delete_plant(?)", [plantId]);
  } catch (error) {
    if (!isProcedureMismatchError(error)) {
      throw error;
    }
    await deletePlantDirect(plantId);
  }
}

export default withMethods(["POST", "PUT", "DELETE"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }

  const audit = (input: Parameters<typeof recordAdminAudit>[1]) => recordAdminAudit(req, input);

  if (req.method === "POST") {
    try {
      await runPlantAssetUpload(req, res);
    } catch (error) {
      return sendError(res, "UPLOAD_ERROR", (error as Error).message, 400);
    }

    const commonName = String(req.body.commonName || "").trim();
    const scientificName = String(req.body.scientificName || "").trim();
    const species = String(req.body.species || "").trim();
    const confidenceScore = Number(req.body.confidenceScore || 0);
    const safeName = toFileSafeToken(commonName);

    let jsonFile = String(req.body.jsonFile || "").trim();
    let imageUrl = "";
    const uploadedFiles = ((req as NextApiRequest & { files?: Record<string, UploadedAsset[]> }).files || {}) as Record<string, UploadedAsset[]>;
    const jsonUpload = uploadedFiles.jsonFileUpload?.[0];
    const imageUpload = uploadedFiles.plantImageUpload?.[0];

    if (jsonUpload) {
      const uploadedPath = jsonUpload.path;
      const jsonFileName = `${Date.now()}-${safeName}-${jsonUpload.originalname.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const destDir = backendPath("data", "plants");
      await fs.mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, jsonFileName);
      await fs.rename(uploadedPath, destPath);
      jsonFile = path.join("data", "plants", jsonFileName).replace(/\\/g, "/");
    }

    if (imageUpload) {
      if (!jsonFile) {
        return sendError(res, "VALIDATION_ERROR", "Provide JSON file (upload or path) when uploading an image", 422);
      }

      const extension = path.extname(imageUpload.originalname).toLowerCase() || ".jpg";
      const imageFileName = `${Date.now()}-${safeName}${extension}`;
      const publicPlantsDir = backendPath("public", "plants");
      await fs.mkdir(publicPlantsDir, { recursive: true });
      const imageDestPath = path.join(publicPlantsDir, imageFileName);
      await fs.rename(imageUpload.path, imageDestPath);
      imageUrl = `/plants/${imageFileName}`;
    }

    const parsed = plantAdminSchema.safeParse({
      commonName,
      scientificName,
      species,
      confidenceScore,
      jsonFile
    });

    if (!parsed.success) {
      await audit({
        action: "plant.create",
        targetType: "plant",
        status: "failure",
        metadata: { reason: "validation_error" }
      });
      return sendError(res, "VALIDATION_ERROR", "Invalid plant payload", 422, parsed.error.flatten());
    }

    try {
      if (imageUrl) {
        await applyImageUrlToPlantJson(jsonFile, imageUrl);
      }
      await readPlantJson(jsonFile);
    } catch {
      await audit({
        action: "plant.create",
        targetType: "plant",
        targetId: commonName || null,
        status: "failure",
        metadata: { reason: "invalid_json" }
      });
      return sendError(res, "INVALID_PLANT_JSON", "Uploaded JSON does not match required plant result structure", 422);
    }

    await upsertPlantWithFallback(null, commonName, scientificName, species, confidenceScore, jsonFile);

    invalidatePlantJsonCache();
    await bumpCacheVersion("plants");
    await audit({
      action: "plant.create",
      targetType: "plant",
      targetId: commonName,
      status: "success",
      metadata: { jsonFile }
    });
    return sendSuccess(res, { message: "Plant created" }, 201);
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
    const parsedDelete = plantDeleteSchema.safeParse(body);
    if (!parsedDelete.success) {
      await audit({
        action: "plant.delete",
        targetType: "plant",
        status: "failure",
        metadata: { reason: "validation_error" }
      });
      return sendError(res, "VALIDATION_ERROR", "plantId is required for delete", 422, parsedDelete.error.flatten());
    }

    await deletePlantWithFallback(parsedDelete.data.plantId);
    invalidatePlantJsonCache();
    await bumpCacheVersion("plants");
    await audit({
      action: "plant.delete",
      targetType: "plant",
      targetId: parsedDelete.data.plantId,
      status: "success"
    });
    return sendSuccess(res, { message: "Plant deleted" });
  }

  const parsed = plantAdminSchema.safeParse(body);
  if (!parsed.success || !parsed.data.plantId) {
    await audit({
      action: "plant.update",
      targetType: "plant",
      targetId: parsed.success ? parsed.data.plantId || null : null,
      status: "failure",
      metadata: { reason: "validation_error" }
    });
    return sendError(
      res,
      "VALIDATION_ERROR",
      "plantId is required with valid payload",
      422,
      parsed.success ? undefined : parsed.error.flatten()
    );
  }

  const { plantId, commonName, scientificName, species, confidenceScore, jsonFile } = parsed.data;

  try {
    await readPlantJson(jsonFile);
  } catch {
    await audit({
      action: "plant.update",
      targetType: "plant",
      targetId: plantId,
      status: "failure",
      metadata: { reason: "invalid_json" }
    });
    return sendError(res, "INVALID_PLANT_JSON", "Referenced JSON file is missing or does not match required structure", 422);
  }

  await upsertPlantWithFallback(plantId, commonName, scientificName, species, confidenceScore, jsonFile);

  invalidatePlantJsonCache();
  await bumpCacheVersion("plants");
  await audit({
    action: "plant.update",
    targetType: "plant",
    targetId: plantId,
    status: "success",
    metadata: { jsonFile }
  });
  return sendSuccess(res, { message: "Plant updated" });
});
