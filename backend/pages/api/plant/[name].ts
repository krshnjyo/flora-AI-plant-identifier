/**
 * File: backend/pages/api/plant/[name].ts
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
import fs from "fs/promises";
import { withMethods } from "@/lib/api-handler";
import { backendPath } from "@/lib/backend-root";
import { buildPublicImageIndex, type PublicImageIndex, resolvePreferredImageUrl } from "@/lib/catalog-image";
import { findPlantJsonByName } from "@/lib/plant-json";
import { sendError, sendSuccess } from "@/lib/response";

async function readPublicImageIndex(publicDir: string, publicUrlPrefix: string) {
  try {
    const entries = await fs.readdir(publicDir, { withFileTypes: true });
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    return buildPublicImageIndex(publicUrlPrefix, fileNames);
  } catch {
    return buildPublicImageIndex(publicUrlPrefix, []);
  }
}

async function getPublicPlantImageIndexes() {
  const [galleryResult, legacy] = await Promise.all([
    readPublicImageIndex(backendPath("public", "gallery-result", "plants"), "/gallery-result/plants"),
    readPublicImageIndex(backendPath("public", "plants"), "/plants")
  ]);

  return { galleryResult, legacy };
}

function resolvePlantImageUrl(
  imageIndexes: { galleryResult: PublicImageIndex; legacy: PublicImageIndex },
  commonName: string,
  options: {
    aliases?: string[];
    declaredImageUrl?: string | null;
  } = {}
) {
  return (
    resolvePreferredImageUrl(imageIndexes.galleryResult, commonName, options) ||
    resolvePreferredImageUrl(imageIndexes.legacy, commonName, options)
  );
}

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = String(req.query.name || "").trim();
  if (name.length < 2) {
    return sendError(res, "INVALID_NAME", "Plant name is required", 422);
  }

  try {
    const localMatch = await findPlantJsonByName(name);
    if (localMatch) {
      const imageIndexes = await getPublicPlantImageIndexes();
      const imageUrl = resolvePlantImageUrl(imageIndexes, localMatch.common_name, {
        aliases: [localMatch.scientific_name, localMatch.species],
        declaredImageUrl: localMatch.image_url || null
      });

      return sendSuccess(res, {
        ...localMatch,
        image_url: imageUrl || localMatch.image_url || ""
      });
    }
  } catch {
    // Ignore catalog parse errors and return the not-found response below.
  }

  return sendError(res, "PLANT_NOT_FOUND", "Not found in model catalog", 404);
});
