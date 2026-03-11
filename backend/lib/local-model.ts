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
};

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

  return {
    predictedClass,
    confidence,
    plantName,
    diseaseName,
    isHealthy,
    leafLikelihood,
    retrySuggested,
    retryMessage
  } satisfies LocalModelPrediction;
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
    throw new Error(`Local model error ${response.status}: ${text}`);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("Local model returned a non-JSON response");
  }

  return decodeLocalModelPayload(payload);
}
