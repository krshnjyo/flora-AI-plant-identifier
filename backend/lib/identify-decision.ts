/**
 * File: backend/lib/identify-decision.ts
 * Purpose: Shared decision helper for final identify route output selection.
 *
 * Responsibilities:
 * - Resolves final entity type (`plant`, `disease`, `not_found`) based on mode and matches.
 * - Picks canonical names used in API response and scan history persistence.
 * - Keeps response-priority rules deterministic and testable.
 */

export type IdentifyOutputMode = "smart" | "plant" | "disease";

type PlantMatchLite = {
  common_name: string;
  scientific_name: string;
} | null;

type DiseaseMatchLite = {
  disease_name: string;
  primary_plant_name: string | null;
  linked_plant_names: string[];
} | null;

export type IdentifyDecisionInput = {
  outputMode: IdentifyOutputMode;
  identifiedName: string;
  diseaseGuess: string;
  plantMatch: PlantMatchLite;
  diseaseMatch: DiseaseMatchLite;
  allowModelFallback?: boolean;
};

export type IdentifyDecisionResult = {
  entityType: "plant" | "disease" | "not_found";
  canonicalName: string;
  canonicalPlantName: string | null;
  resolvedDiseaseName: string | null;
};

export function resolveIdentifyDecision(input: IdentifyDecisionInput): IdentifyDecisionResult {
  const allowModelFallback = input.allowModelFallback ?? true;
  const plantLabelFromModel = input.identifiedName.trim() || null;
  const directPlantSignal =
    (input.plantMatch ? input.plantMatch.common_name || input.plantMatch.scientific_name : null) ||
    plantLabelFromModel ||
    null;
  const hasPlantSignal = Boolean(directPlantSignal || input.diseaseMatch?.primary_plant_name || input.diseaseMatch?.linked_plant_names?.[0]);

  // Prioritize model-derived plant label before disease metadata fallbacks.
  // This avoids cross-species drift for shared diseases (e.g., blight variants)
  // when the disease resolver picks a different primary plant.
  const canonicalPlantName =
    directPlantSignal ||
    input.diseaseMatch?.primary_plant_name ||
    input.diseaseMatch?.linked_plant_names?.[0] ||
    null;

  const canonicalDiseaseName = input.diseaseMatch ? input.diseaseMatch.disease_name : null;
  const resolvedDiseaseName = canonicalDiseaseName || input.diseaseGuess || null;

  let entityType: "plant" | "disease" | "not_found" = "not_found";
  let canonicalName = input.identifiedName || input.diseaseGuess || "";

  if (input.outputMode === "disease" && resolvedDiseaseName) {
    entityType = "disease";
    canonicalName = resolvedDiseaseName;
  } else if (input.outputMode === "disease" && !allowModelFallback) {
    entityType = "not_found";
    canonicalName = resolvedDiseaseName || canonicalName;
  } else if (input.outputMode === "plant" && directPlantSignal) {
    entityType = "plant";
    canonicalName = directPlantSignal;
  } else if (input.outputMode === "plant" && !allowModelFallback) {
    entityType = "not_found";
    canonicalName = canonicalPlantName || canonicalName;
  } else if (hasPlantSignal) {
    entityType = "plant";
    canonicalName = canonicalPlantName || canonicalName;
  } else if (resolvedDiseaseName) {
    entityType = "disease";
    canonicalName = resolvedDiseaseName;
  }

  return {
    entityType,
    canonicalName,
    canonicalPlantName,
    resolvedDiseaseName
  };
}
