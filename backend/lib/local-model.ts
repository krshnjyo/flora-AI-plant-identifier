/**
 * File: backend/lib/local-model.ts
 * Purpose: Local TensorFlow model client for plant + disease prediction.
 */

import fs from "fs/promises";
import { env } from "./env.ts";

export type LocalModelPrediction = {
  predictedClass: string;
  confidence: number;
  plantName: string;
  diseaseName: string;
  isHealthy: boolean;
  leafLikelihood: number;
  retrySuggested: boolean;
  retryMessage: string;
  topClasses: Array<{
    className: string;
    confidence: number;
  }>;
  plantScores: Record<string, number>;
};

function summarizeLocalModelFailure(status: number, contentType: string | null, bodyText: string) {
  const normalizedType = String(contentType || "").toLowerCase();
  const trimmedBody = bodyText.trim();
  const looksLikeHtml =
    normalizedType.includes("text/html") || /<!doctype html|<html[\s>]/i.test(trimmedBody);

  if (looksLikeHtml) {
    return `Local model service returned ${status}. Check the deployed model service health endpoint and LOCAL_MODEL_ENDPOINT.`;
  }

  if (!trimmedBody) {
    return `Local model service returned ${status}.`;
  }

  const condensed = trimmedBody.replace(/\s+/g, " ").slice(0, 240);
  return `Local model error ${status}: ${condensed}`;
}

/**
 * Confidence floor below which the model result is treated as unreliable for
 * direct routing. This keeps weak predictions from being presented as factual
 * plant/disease identifications.
 */
export const LOCAL_MODEL_MIN_CONFIDENCE = 0.8;
export const LOCAL_MODEL_MIN_CLASS_MARGIN = 0.18;
export const LOCAL_MODEL_MIN_PLANT_SCORE = 0.72;

const SUPPORTED_PLANT_NAMES = new Set(["Pepper", "Potato", "Tomato"]);
const SUPPORTED_DISEASE_NAMES = new Set(["", "Bacterial Spot", "Early Blight", "Late Blight"]);

type ModelClassMapping = {
  plantName: string;
  diseaseName: string;
  isHealthy: boolean;
};

const CLASS_MAP: Record<string, ModelClassMapping> = {
  Pepper__bell___Bacterial_spot: {
    plantName: "Pepper",
    diseaseName: "Bacterial Spot",
    isHealthy: false
  },
  Pepper__bell___healthy: {
    plantName: "Pepper",
    diseaseName: "",
    isHealthy: true
  },
  PlantVillage: {
    plantName: "",
    diseaseName: "",
    isHealthy: false
  },
  Potato___Early_blight: {
    plantName: "Potato",
    diseaseName: "Early Blight",
    isHealthy: false
  },
  Potato___healthy: {
    plantName: "Potato",
    diseaseName: "",
    isHealthy: true
  },
  Potato___Late_blight: {
    plantName: "Potato",
    diseaseName: "Late Blight",
    isHealthy: false
  },
  Tomato_Bacterial_spot: {
    plantName: "Tomato",
    diseaseName: "Bacterial Spot",
    isHealthy: false
  },
  Tomato_Early_blight: {
    plantName: "Tomato",
    diseaseName: "Early Blight",
    isHealthy: false
  },
  Tomato_Leaf_Mold: {
    plantName: "Tomato",
    diseaseName: "Leaf Mold",
    isHealthy: false
  },
  Tomato_Septoria_leaf_spot: {
    plantName: "Tomato",
    diseaseName: "Septoria Leaf Spot",
    isHealthy: false
  },
  Tomato_Spider_mites_Two_spotted_spider_mite: {
    plantName: "Tomato",
    diseaseName: "Spider Mites Two Spotted Spider Mite",
    isHealthy: false
  },
  Tomato__Target_Spot: {
    plantName: "Tomato",
    diseaseName: "Target Spot",
    isHealthy: false
  },
  Tomato__Tomato_YellowLeaf__Curl_Virus: {
    plantName: "Tomato",
    diseaseName: "Tomato Yellow Leaf Curl Virus",
    isHealthy: false
  },
  Tomato_mosaic_virus: {
    plantName: "Tomato",
    diseaseName: "Tomato Mosaic Virus",
    isHealthy: false
  },
  Tomato__Tomato_mosaic_virus: {
    plantName: "Tomato",
    diseaseName: "Tomato Mosaic Virus",
    isHealthy: false
  },
  Tomato_healthy: {
    plantName: "Tomato",
    diseaseName: "",
    isHealthy: true
  },
  Tomato_Late_blight: {
    plantName: "Tomato",
    diseaseName: "Late Blight",
    isHealthy: false
  }
};

function normalizeClassName(label: string) {
  return label.trim().replace(/\s+/g, "_");
}

function formatTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function decodeClass(label: string): ModelClassMapping {
  const normalized = normalizeClassName(label);
  const mapped = CLASS_MAP[normalized];
  if (mapped) {
    return mapped;
  }

  const lower = normalized.toLowerCase();
  const isHealthy = lower.includes("healthy");
  const plantName = lower.includes("potato")
    ? "Potato"
    : lower.includes("tomato")
      ? "Tomato"
      : lower.includes("pepper")
        ? "Pepper"
        : "";

  let diseaseName = "";
  if (!isHealthy) {
    if (lower.includes("early_blight")) diseaseName = "Early Blight";
    else if (lower.includes("late_blight")) diseaseName = "Late Blight";
    else if (lower.includes("bacterial_spot")) diseaseName = "Bacterial Spot";
    else {
      const maybeDisease = normalized.split(/___|_/g).slice(1).join(" ");
      diseaseName = maybeDisease ? formatTitleCase(maybeDisease) : "";
    }
  }

  return {
    plantName,
    diseaseName,
    isHealthy
  };
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizePlantName(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("potato")) return "Potato";
  if (normalized.includes("tomato")) return "Tomato";
  if (normalized.includes("pepper")) return "Pepper";
  return formatTitleCase(value);
}

function readStringField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readBooleanField(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
  }
  return null;
}

function readPlantFromScores(payload: Record<string, unknown>) {
  const raw = payload.plant_scores;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return "";
  }

  let bestPlant = "";
  let bestScore = -1;
  for (const [plant, score] of Object.entries(raw as Record<string, unknown>)) {
    const numeric = toFiniteNumber(score);
    if (numeric > bestScore) {
      bestScore = numeric;
      bestPlant = normalizePlantName(plant);
    }
  }

  return bestPlant;
}

function readTopClasses(payload: Record<string, unknown>) {
  const raw = payload.top_classes;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const className =
        readStringField(entry as Record<string, unknown>, ["class", "label", "predicted_class", "predictedClass"]) || "";
      const confidence = toFiniteNumber((entry as Record<string, unknown>).confidence);
      if (!className) {
        return null;
      }

      return {
        className,
        confidence
      };
    })
    .filter((entry): entry is { className: string; confidence: number } => Boolean(entry));
}

function normalizePlantScores(payload: Record<string, unknown>) {
  const raw = payload.plant_scores;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const out: Record<string, number> = {};
  for (const [plant, score] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedPlant = normalizePlantName(plant);
    if (!normalizedPlant) continue;
    out[normalizedPlant] = toFiniteNumber(score);
  }

  return out;
}

function buildSyntheticClassLabel(plantName: string, diseaseName: string, isHealthy: boolean) {
  const plantToken = plantName ? normalizeClassName(plantName) : "unknown_plant";
  if (diseaseName) {
    return `${plantToken}___${normalizeClassName(diseaseName)}`;
  }
  if (isHealthy) {
    return `${plantToken}___healthy`;
  }
  return plantToken;
}

export function decodeLocalModelPayload(payload: Record<string, unknown>) {
  const rawPredictedClass = readStringField(payload, ["class", "label", "predicted_class", "predictedClass", "prediction"]);
  const explicitPlantName = readStringField(payload, [
    "plant_name",
    "plantName",
    "predicted_plant",
    "predictedPlant",
    "plant",
    "species"
  ]);
  const explicitDiseaseName = readStringField(payload, [
    "disease_name",
    "diseaseName",
    "predicted_disease",
    "predictedDisease",
    "disease",
    "condition"
  ]);
  const explicitHealthy = readBooleanField(payload, ["is_healthy", "isHealthy", "healthy"]);
  const explicitHasDisease = readBooleanField(payload, ["has_disease", "hasDisease"]);
  const retrySuggested = readBooleanField(payload, ["needs_retry", "needsRetry", "retry_suggested", "retrySuggested"]) ?? false;
  const retryMessage = readStringField(payload, ["retry_message", "retryMessage"]);
  const scoredPlant = readPlantFromScores(payload);

  if (!rawPredictedClass && !explicitPlantName && !explicitDiseaseName) {
    throw new Error("Local model response missing class label");
  }

  const decoded = rawPredictedClass
    ? decodeClass(rawPredictedClass)
    : {
        plantName: "",
        diseaseName: "",
        isHealthy: false
      };

  const plantName = normalizePlantName(explicitPlantName || scoredPlant || decoded.plantName);
  const diseaseName = explicitDiseaseName || decoded.diseaseName;
  let isHealthy = decoded.isHealthy;

  if (explicitHealthy !== null) {
    isHealthy = explicitHealthy;
  } else if (explicitHasDisease !== null) {
    isHealthy = !explicitHasDisease;
  } else if (diseaseName) {
    isHealthy = false;
  }

  const predictedClass = rawPredictedClass || buildSyntheticClassLabel(plantName, diseaseName, isHealthy);
  const confidence = toFiniteNumber(payload.confidence ?? payload.score ?? payload.probability);
  const leafLikelihood = toFiniteNumber(payload.leaf_likelihood ?? payload.leafLikelihood);
  const topClasses = readTopClasses(payload);
  const plantScores = normalizePlantScores(payload);

  return {
    predictedClass,
    confidence,
    plantName,
    diseaseName,
    isHealthy,
    leafLikelihood,
    retrySuggested,
    retryMessage,
    topClasses,
    plantScores
  } satisfies LocalModelPrediction;
}

/**
 * Identifies predictions that should be rejected before catalog matching.
 * The threshold is intentionally conservative so only clearly weak outputs are
 * sent back for another image instead of creating a misleading result page.
 */
export function isLowConfidencePrediction(prediction: Pick<LocalModelPrediction, "confidence">) {
  return prediction.confidence < LOCAL_MODEL_MIN_CONFIDENCE;
}

/**
 * Only catalog-supported plant and disease outputs should be allowed through to
 * result routing. Unsupported disease labels are treated as unrecognizable
 * rather than silently mapped to the nearest known result page.
 */
export function isSupportedCatalogPrediction(
  prediction: Pick<LocalModelPrediction, "plantName" | "diseaseName">
) {
  return SUPPORTED_PLANT_NAMES.has(prediction.plantName) && SUPPORTED_DISEASE_NAMES.has(prediction.diseaseName);
}

function getTopClassMargin(
  prediction: Pick<LocalModelPrediction, "topClasses" | "confidence">
) {
  if (!prediction.topClasses.length) {
    return prediction.confidence;
  }

  const [topClass, runnerUp] = prediction.topClasses;
  if (!runnerUp) {
    return topClass.confidence;
  }

  return topClass.confidence - runnerUp.confidence;
}

function getTopPlantScore(prediction: Pick<LocalModelPrediction, "plantScores">) {
  const scores = Object.values(prediction.plantScores);
  return scores.length ? Math.max(...scores) : 0;
}

function getTopPlantScoreMargin(prediction: Pick<LocalModelPrediction, "plantScores">) {
  const scores = Object.values(prediction.plantScores).sort((left, right) => right - left);
  if (!scores.length) {
    return 0;
  }

  return scores[0] - (scores[1] ?? 0);
}

/**
 * Closed-set classifiers will always emit one of the known classes, even for
 * out-of-domain leaves. Require a stronger winning score and class margin
 * before allowing routing into a catalog result page.
 */
export function shouldRetryCatalogPrediction(
  prediction: Pick<LocalModelPrediction, "confidence" | "topClasses" | "plantScores">
) {
  if (isLowConfidencePrediction(prediction)) {
    return true;
  }

  if (getTopClassMargin(prediction) < LOCAL_MODEL_MIN_CLASS_MARGIN) {
    return true;
  }

  if (getTopPlantScore(prediction) < LOCAL_MODEL_MIN_PLANT_SCORE) {
    return true;
  }

  // Even when the winning plant score clears the minimum, an out-of-catalog
  // leaf can still be forced into the closest known crop. Requiring a visible
  // gap between the best and second-best plant family reduces those false
  // positives without changing the response contract.
  return getTopPlantScoreMargin(prediction) < 0.18;
}

export async function identifyWithLocalModel(filePath: string, mimeType: string) {
  const fileBuffer = await fs.readFile(filePath);
  const formData = new FormData();
  formData.append("image", new Blob([fileBuffer], { type: mimeType || "image/jpeg" }), "scan.jpg");

  const response = await fetch(env.localModelEndpoint, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(summarizeLocalModelFailure(response.status, response.headers.get("content-type"), text));
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("Local model returned a non-JSON response");
  }

  return decodeLocalModelPayload(payload);
}
