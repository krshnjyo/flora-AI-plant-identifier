/**
 * File: backend/pages/api/identify.ts
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

import type { Pool } from "mysql2/promise";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { runImageUpload } from "@/lib/upload";
import { identifyWithLocalModel } from "@/lib/local-model";
import { getPool } from "@/lib/db";
import { findPlantJsonByName } from "@/lib/plant-json";
import { resolveDiseaseMatch } from "@/lib/disease-resolver";
import { resolvePlantMatch } from "@/lib/plant-resolver";
import { sanitizeDiseaseLabel, sanitizePlantLabel } from "@/lib/name-normalization";
import { sendError, sendSuccess } from "@/lib/response";
import { getUserFromRequest } from "@/lib/auth";
import { consumeRateLimitHybrid, getRateLimitKey, setRateLimitHeaders } from "@/lib/rate-limit";
import { backendPath } from "@/lib/backend-root";
import { resolveIdentifyDecision } from "@/lib/identify-decision";

type PlantRow = { plant_id: number | null; common_name: string; scientific_name: string };
type OutputMode = "smart" | "plant" | "disease";

export const config = {
  api: {
    bodyParser: false
  }
};

export default withMethods(["POST"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rateKey = getRateLimitKey("identify", req.headers["x-forwarded-for"] || req.socket.remoteAddress);
  const rate = await consumeRateLimitHybrid(rateKey, 30, 60_000);
  setRateLimitHeaders(res, rate);
  if (!rate.allowed) {
    return sendError(res, "RATE_LIMITED", "Too many identify requests. Try again shortly.", 429);
  }

  try {
    await runImageUpload(req, res);
  } catch (error) {
    return sendError(res, "UPLOAD_ERROR", (error as Error).message, 400);
  }

  if (!req.file) {
    return sendError(res, "IMAGE_REQUIRED", "Image file is required", 400);
  }

  const imagePath = `/uploads/${req.file.filename}`;
  const imageAbsolutePath = backendPath("public", "uploads", req.file.filename);
  const outputModeRaw = String(req.body?.output_mode || "smart").trim().toLowerCase();
  const outputMode: OutputMode =
    outputModeRaw === "plant" || outputModeRaw === "disease" ? outputModeRaw : "smart";

  let identifiedName = "";
  let diseaseGuess = "";
  let diseaseDetectionSource: "local_model" | null = null;
  const identifiedBy = "local_model";
  let modelClass = "";
  let modelConfidence = 0;
  const mimeType = req.file.mimetype || "image/jpeg";

  try {
    const modelPrediction = await identifyWithLocalModel(imageAbsolutePath, mimeType);
    if (modelPrediction.retrySuggested) {
      return sendError(
        res,
        "RETRY_WITH_LEAF",
        modelPrediction.retryMessage || "Image does not look like a clear leaf. Try again with a close leaf photo.",
        422,
        process.env.NODE_ENV === "development"
          ? {
              model_class: modelPrediction.predictedClass || null,
              model_confidence: modelPrediction.confidence,
              leaf_likelihood: modelPrediction.leafLikelihood
            }
          : undefined
      );
    }

    identifiedName = sanitizePlantLabel(modelPrediction.plantName);
    diseaseGuess = sanitizeDiseaseLabel(modelPrediction.diseaseName);
    modelClass = modelPrediction.predictedClass;
    modelConfidence = modelPrediction.confidence;
    if (diseaseGuess) {
      diseaseDetectionSource = "local_model";
    }
  } catch (error) {
    return sendError(
      res,
      "IDENTIFICATION_FAILED",
      error instanceof Error ? error.message : "Local model inference failed",
      502
    );
  }

  if (!identifiedName && !diseaseGuess) {
    return sendError(
      res,
      "IDENTIFICATION_EMPTY",
      "Could not identify a valid plant or disease name from this image.",
      422,
      process.env.NODE_ENV === "development"
        ? {
            model_class: modelClass || null,
            model_confidence: modelConfidence
          }
      : undefined
    );
  }

  let pool: Pool | null = null;
  try {
    pool = getPool();
  } catch {
    pool = null;
  }

  let plantMatch: PlantRow | null = null;
  if (pool && identifiedName) {
    try {
      const resolvedPlant = await resolvePlantMatch(pool, identifiedName);
      if (resolvedPlant) {
        plantMatch = {
          plant_id: resolvedPlant.plant_id,
          common_name: resolvedPlant.common_name,
          scientific_name: resolvedPlant.scientific_name
        };
      }
    } catch {
      // Keep identification flow alive even if DB matching is unavailable.
    }
  }

  if (!plantMatch && identifiedName) {
    const localPlant = await findPlantJsonByName(identifiedName);
    if (localPlant) {
      plantMatch = {
        plant_id: localPlant.plant_id ?? null,
        common_name: localPlant.common_name,
        scientific_name: localPlant.scientific_name
      };
    }
  }

  let diseaseMatch = null;
  if (pool && diseaseGuess) {
    try {
      diseaseMatch = await resolveDiseaseMatch(pool, diseaseGuess, {
        plantId: plantMatch?.plant_id ?? null,
        plantHints: [plantMatch?.common_name || "", plantMatch?.scientific_name || "", identifiedName]
      });
    } catch {
      // Disease DB matching is best-effort; keep response alive with inferred labels.
      diseaseMatch = null;
    }
  }

  const decision = resolveIdentifyDecision({
    outputMode,
    identifiedName,
    diseaseGuess,
    plantMatch,
    diseaseMatch
  });
  const entityType = decision.entityType;
  const canonicalName = decision.canonicalName;
  const canonicalPlantName = decision.canonicalPlantName;
  const resolvedDiseaseName = decision.resolvedDiseaseName;
  const responsePlantName = canonicalPlantName || (entityType === "plant" ? canonicalName : null);
  const responseDiseaseName = resolvedDiseaseName || (entityType === "disease" ? canonicalName : null);

  const user = getUserFromRequest(req);
  if (pool) {
    try {
      await pool.execute(
        "INSERT INTO scan_history (user_id, plant_id, disease_id, plant_name, disease_name, image_url) VALUES (?, ?, ?, ?, ?, ?)",
        [
          user?.userId ?? null,
          plantMatch?.plant_id ?? diseaseMatch?.primary_plant_id ?? diseaseMatch?.linked_plant_ids?.[0] ?? null,
          diseaseMatch?.disease_id ?? null,
          responsePlantName,
          responseDiseaseName,
          imagePath
        ]
      );
    } catch {
      // Backward-compatible insert for installations that haven't added scan_history foreign keys yet.
      try {
        await pool.execute(
          "INSERT INTO scan_history (user_id, plant_name, disease_name, image_url) VALUES (?, ?, ?, ?)",
          [user?.userId ?? null, responsePlantName, responseDiseaseName, imagePath]
        );
      } catch {
        // Keep identify response successful even if history persistence fails.
      }
    }
  }

  if (entityType === "not_found") {
    return sendSuccess(res, {
      identified_name: identifiedName,
      type: entityType,
      message: "Not found in model catalog",
      image_url: imagePath,
      identified_by: identifiedBy,
      model_class: modelClass,
      model_confidence: modelConfidence,
      plant_name: responsePlantName,
      disease_name: responseDiseaseName,
      has_both: Boolean(responsePlantName && responseDiseaseName),
      output_mode: outputMode
    });
  }

  return sendSuccess(res, {
    identified_name: canonicalName,
    type: entityType,
    image_url: imagePath,
    identified_by: identifiedBy,
    model_class: modelClass,
    model_confidence: modelConfidence,
    plant_name: responsePlantName,
    disease_name: responseDiseaseName,
    disease_identified_by: responseDiseaseName ? diseaseDetectionSource : null,
    has_both: Boolean(responsePlantName && responseDiseaseName),
    output_mode: outputMode
  });
});
