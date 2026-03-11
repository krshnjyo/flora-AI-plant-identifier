/**
 * File: frontend/lib/plants-cache.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import { apiFetch } from "@/lib/api-client";

export type PlantListItem = {
  plant_id: number;
  common_name: string;
  scientific_name: string;
  species: string;
  confidence_score: number;
  image_url: string | null;
};

const CACHE_TTL_MS = 2 * 60 * 1000;

let cachedPlants: PlantListItem[] | null = null;
let cachedAtMs = 0;
let inFlight: Promise<PlantListItem[]> | null = null;

function isFresh() {
  return Boolean(cachedPlants && Date.now() - cachedAtMs < CACHE_TTL_MS);
}

export function getCachedPlants() {
  return isFresh() ? cachedPlants : null;
}

async function fetchPlants() {
  const response = await apiFetch("/api/plants");
  const data = await response.json();
  if (!response.ok || !data?.success || !Array.isArray(data?.data)) {
    throw new Error("Failed to load plants");
  }

  cachedPlants = data.data as PlantListItem[];
  cachedAtMs = Date.now();
  return cachedPlants;
}

export async function preloadPlants() {
  if (isFresh()) {
    return cachedPlants as PlantListItem[];
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchPlants()
    .catch(() => {
      if (cachedPlants) {
        return cachedPlants;
      }
      return [];
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function refreshPlants() {
  inFlight = fetchPlants()
    .catch(() => {
      if (cachedPlants) {
        return cachedPlants;
      }
      return [];
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
