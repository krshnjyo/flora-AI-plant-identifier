/**
 * File: frontend/lib/diseases-cache.ts
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

export type DiseaseListItem = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  severity_level: string;
  image_url: string | null;
};

const CACHE_TTL_MS = 2 * 60 * 1000;

let cachedDiseases: DiseaseListItem[] | null = null;
let cachedAtMs = 0;
let inFlight: Promise<DiseaseListItem[]> | null = null;

function isFresh() {
  return Boolean(cachedDiseases && Date.now() - cachedAtMs < CACHE_TTL_MS);
}

export function getCachedDiseases() {
  return isFresh() ? cachedDiseases : null;
}

async function fetchDiseases() {
  const response = await apiFetch("/api/diseases");
  const data = await response.json();
  if (!response.ok || !data?.success || !Array.isArray(data?.data)) {
    throw new Error("Failed to load diseases");
  }

  cachedDiseases = data.data as DiseaseListItem[];
  cachedAtMs = Date.now();
  return cachedDiseases;
}

export async function preloadDiseases() {
  if (isFresh()) {
    return cachedDiseases as DiseaseListItem[];
  }

  if (inFlight) {
    return inFlight;
  }

  inFlight = fetchDiseases()
    .catch(() => {
      if (cachedDiseases) {
        return cachedDiseases;
      }
      return [];
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export async function refreshDiseases() {
  inFlight = fetchDiseases()
    .catch(() => {
      if (cachedDiseases) {
        return cachedDiseases;
      }
      return [];
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
