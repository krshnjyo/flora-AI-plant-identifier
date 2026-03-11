/**
 * File: backend/lib/plant-json.ts
 * Purpose: Load, validate, cache, and resolve plant JSON catalog entries.
 *
 * Responsibilities:
 * - Enforces JSON schema validation before data is used by API responses.
 * - Caches parsed files and derived indexes to reduce repeated disk reads.
 * - Provides safe path resolution to prevent directory traversal.
 */

import fs from "fs/promises";
import path from "path";
import { type PlantResultJsonSchema, plantResultJsonSchema } from "@/lib/plant-json-schema";
import { backendPath } from "@/lib/backend-root";

type PlantJsonCacheEntry = {
  mtimeMs: number;
  data: PlantResultJsonSchema;
};

type PlantCatalogEntry = {
  jsonFile: string;
  data: PlantResultJsonSchema;
};

type PlantNameIndex = {
  byExactName: Map<string, PlantResultJsonSchema>;
  normalizedEntries: Array<{ normalized: string; data: PlantResultJsonSchema }>;
};

const plantJsonCache = new Map<string, PlantJsonCacheEntry>();
let catalogCache: { expiresAt: number; data: PlantCatalogEntry[] } | null = null;
let nameIndexCache: { expiresAt: number; data: PlantNameIndex } | null = null;
const CATALOG_CACHE_TTL_MS = 30_000;

function getPlantDataDirectory() {
  return backendPath("data", "plants");
}

function normalizePlantName(name: string) {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,:;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function resolvePlantJsonPath(jsonFile: string) {
  // Reject paths that escape the canonical plant catalog directory.
  const baseDir = getPlantDataDirectory();
  const resolved = path.resolve(path.isAbsolute(jsonFile) ? jsonFile : backendPath(jsonFile));
  const normalizedBase = `${baseDir}${path.sep}`;

  if (resolved !== baseDir && !resolved.startsWith(normalizedBase)) {
    throw new Error("Plant JSON path must stay inside data/plants");
  }

  return resolved;
}

export async function readPlantJson(jsonFile: string) {
  // Cache is keyed by absolute path + mtime to avoid stale reads.
  const resolved = resolvePlantJsonPath(jsonFile);
  const stats = await fs.stat(resolved);
  const cached = plantJsonCache.get(resolved);
  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.data;
  }

  const content = await fs.readFile(resolved, "utf8");
  const parsed = JSON.parse(content);
  const validation = plantResultJsonSchema.safeParse(parsed);

  if (!validation.success) {
    throw new Error("Invalid plant JSON structure");
  }

  plantJsonCache.set(resolved, {
    mtimeMs: stats.mtimeMs,
    data: validation.data
  });

  return validation.data;
}

export async function listPlantJsonCatalog() {
  // Short-lived catalog cache avoids re-reading every file on each request.
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.data;
  }

  const dataDir = getPlantDataDirectory();
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const settled = await Promise.allSettled(
    jsonFiles.map(async (fileName): Promise<PlantCatalogEntry> => {
      const jsonFile = path.join("data", "plants", fileName).replace(/\\/g, "/");
      const data = await readPlantJson(jsonFile);
      return { jsonFile, data };
    })
  );

  const results = settled
    .filter((entry): entry is PromiseFulfilledResult<PlantCatalogEntry> => entry.status === "fulfilled")
    .map((entry) => entry.value);

  // Cache only successful entries so one invalid file never blocks the catalog.
  catalogCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    data: results
  };
  nameIndexCache = null;

  return results;
}

async function buildPlantNameIndex() {
  const now = Date.now();
  if (nameIndexCache && nameIndexCache.expiresAt > now) {
    return nameIndexCache.data;
  }

  const catalog = await listPlantJsonCatalog();
  const byExactName = new Map<string, PlantResultJsonSchema>();
  const normalizedEntries: Array<{ normalized: string; data: PlantResultJsonSchema }> = [];

  for (const { data } of catalog) {
    for (const name of [data.common_name, data.scientific_name, data.species]) {
      const normalized = normalizePlantName(name);
      if (!normalized || byExactName.has(normalized)) continue;
      byExactName.set(normalized, data);
      normalizedEntries.push({ normalized, data });
    }
  }

  const index = { byExactName, normalizedEntries };
  nameIndexCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    data: index
  };
  return index;
}

/**
 * Resolve local plant JSON by exact or partial normalized name.
 */
export async function findPlantJsonByName(name: string) {
  const normalized = normalizePlantName(name);
  if (!normalized) return null;

  const index = await buildPlantNameIndex();
  const exact = index.byExactName.get(normalized);
  if (exact) return exact;

  const fuzzy = index.normalizedEntries.find(({ normalized: candidate }) => {
    return candidate.includes(normalized) || normalized.includes(candidate);
  });

  return fuzzy?.data ?? null;
}

/**
 * Clear in-memory catalog caches after admin mutations so subsequent reads are immediate.
 */
export function invalidatePlantJsonCache() {
  catalogCache = null;
  nameIndexCache = null;
  plantJsonCache.clear();
}
