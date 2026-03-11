/**
 * File: backend/pages/api/disease/[name].ts
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
import { findDiseaseJsonByName } from "@/lib/disease-json";
import { getPool } from "@/lib/db";
import { resolveDiseaseMatch } from "@/lib/disease-resolver";
import { sendError, sendSuccess } from "@/lib/response";

type DiseaseResponse = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  image_url: string;
  disease_category: string;
  pathogen_type: string;
  affected_parts: string;
  favorable_conditions: string;
  diagnosis_notes: string;
  disease_description: string;
  symptoms: string;
  causes: string;
  prevention_methods: string;
  treatment_methods: string;
  treatment_organic: string;
  treatment_chemical: string;
  recovery_time: string;
  monitoring_tips: string;
  severity_level: string;
  created_at: string;
  primary_plant_name?: string | null;
  related_plants?: string[];
};

async function readPublicImageIndex(publicDir: string, publicUrlPrefix: string) {
  try {
    const entries = await fs.readdir(publicDir, { withFileTypes: true });
    const fileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    return buildPublicImageIndex(publicUrlPrefix, fileNames);
  } catch {
    return buildPublicImageIndex(publicUrlPrefix, []);
  }
}

async function getPublicDiseaseImageIndexes() {
  const [galleryResult, legacy] = await Promise.all([
    readPublicImageIndex(backendPath("public", "gallery-result", "diseases"), "/gallery-result/diseases"),
    readPublicImageIndex(backendPath("public", "diseases"), "/diseases")
  ]);

  return { galleryResult, legacy };
}

function resolveDiseaseImageUrl(
  imageIndexes: { galleryResult: PublicImageIndex; legacy: PublicImageIndex },
  diseaseName: string,
  options: {
    aliases?: string[];
    declaredImageUrl?: string | null;
  } = {}
) {
  return (
    resolvePreferredImageUrl(imageIndexes.galleryResult, diseaseName, options) ||
    resolvePreferredImageUrl(imageIndexes.legacy, diseaseName, options)
  );
}

function withDiseaseDefaults(base: Partial<DiseaseResponse>): DiseaseResponse {
  return {
    disease_id: Number(base.disease_id || 0),
    disease_name: String(base.disease_name || ""),
    affected_species: String(base.affected_species || ""),
    image_url: String(base.image_url || ""),
    disease_category: String(base.disease_category || "Plant Disease"),
    pathogen_type: String(base.pathogen_type || "Mixed pathogen complex"),
    affected_parts: String(base.affected_parts || "Leaves and stems"),
    favorable_conditions: String(base.favorable_conditions || "High humidity and prolonged leaf wetness."),
    diagnosis_notes: String(base.diagnosis_notes || "Confirm diagnosis using lesion pattern, spread behavior, and field history."),
    disease_description: String(base.disease_description || ""),
    symptoms: String(base.symptoms || ""),
    causes: String(base.causes || ""),
    prevention_methods: String(base.prevention_methods || ""),
    treatment_methods: String(base.treatment_methods || ""),
    treatment_organic: String(base.treatment_organic || "Use sanitation, canopy management, and regular scouting."),
    treatment_chemical: String(base.treatment_chemical || "Use crop-approved treatments under local advisory guidance."),
    recovery_time: String(base.recovery_time || "Recovery depends on stage and intervention speed."),
    monitoring_tips: String(base.monitoring_tips || "Track symptom progression twice weekly after high-risk weather."),
    severity_level: String(base.severity_level || "Medium"),
    created_at: String(base.created_at || new Date().toISOString()),
    primary_plant_name: base.primary_plant_name || null,
    related_plants: Array.isArray(base.related_plants) ? base.related_plants : []
  };
}

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const name = String(req.query.name || "").trim();
  if (name.length < 2) {
    return sendError(res, "INVALID_NAME", "Disease name is required", 422);
  }

  const imageIndexes = await getPublicDiseaseImageIndexes();

  const jsonMatch = await findDiseaseJsonByName(name);
  if (jsonMatch) {
    const imageUrl = resolveDiseaseImageUrl(imageIndexes, jsonMatch.disease_name, {
      declaredImageUrl: jsonMatch.image_url || null
    });

    return sendSuccess(
      res,
      withDiseaseDefaults({
        disease_id: 0,
        ...jsonMatch,
        image_url: imageUrl || jsonMatch.image_url || "",
        created_at: new Date().toISOString()
      })
    );
  }

  // Fallback to DB-backed resolver when local disease JSON is missing.
  try {
    const pool = getPool();
    const dbMatch = await resolveDiseaseMatch(pool, name);
    if (dbMatch) {
      const imageUrl = resolveDiseaseImageUrl(imageIndexes, dbMatch.disease_name);
      return sendSuccess(
        res,
        withDiseaseDefaults({
          disease_id: dbMatch.disease_id,
          disease_name: dbMatch.disease_name,
          affected_species: dbMatch.affected_species,
          disease_description: dbMatch.disease_description,
          symptoms: dbMatch.symptoms,
          causes: dbMatch.causes,
          prevention_methods: dbMatch.prevention_methods,
          treatment_methods: dbMatch.treatment_methods,
          severity_level: dbMatch.severity_level,
          image_url: imageUrl || "",
          primary_plant_name: dbMatch.primary_plant_name,
          related_plants: dbMatch.linked_plant_names,
          created_at: new Date().toISOString()
        })
      );
    }
  } catch {
    // Keep API behavior stable when DB is unavailable.
  }

  return sendError(res, "DISEASE_NOT_FOUND", "Not found in model catalog", 404);
});
