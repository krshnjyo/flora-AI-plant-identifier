/**
 * File: backend/lib/disease-json.ts
 * Purpose: Load, validate, cache, and resolve disease JSON catalog entries.
 *
 * Responsibilities:
 * - Validates disease JSON files against a strict schema.
 * - Builds normalized lookup indexes for exact, partial, and typo-tolerant matching.
 * - Protects file reads with path boundary checks.
 */

import fs from "fs/promises";
import path from "path";
import { type DiseaseResultJsonSchema, diseaseResultJsonSchema } from "@/lib/disease-json-schema";
import { levenshteinDistance } from "@/lib/levenshtein";
import { backendPath } from "@/lib/backend-root";

type DiseaseJsonCacheEntry = {
  mtimeMs: number;
  data: DiseaseResultJsonSchema;
};

type DiseaseCatalogEntry = {
  jsonFile: string;
  data: DiseaseResultJsonSchema;
};

type DiseaseNameIndex = {
  byExactName: Map<string, DiseaseResultJsonSchema>;
  byNormalizedName: Array<{ normalized: string; data: DiseaseResultJsonSchema }>;
};

const diseaseJsonCache = new Map<string, DiseaseJsonCacheEntry>();
let catalogCache: { expiresAt: number; data: DiseaseCatalogEntry[] } | null = null;
let diseaseNameIndexCache: { expiresAt: number; data: DiseaseNameIndex } | null = null;
const CATALOG_CACHE_TTL_MS = 30_000;

function getDiseaseDataDirectory() {
  return backendPath("data", "diseases");
}

function normalizeDiseaseName(name: string) {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,:;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function resolveDiseaseJsonPath(jsonFile: string) {
  // Ensure callers cannot read outside backend/data/diseases.
  const baseDir = getDiseaseDataDirectory();
  const resolved = path.resolve(path.isAbsolute(jsonFile) ? jsonFile : backendPath(jsonFile));
  const normalizedBase = `${baseDir}${path.sep}`;

  if (resolved !== baseDir && !resolved.startsWith(normalizedBase)) {
    throw new Error("Disease JSON path must stay inside data/diseases");
  }

  return resolved;
}

export async function readDiseaseJson(jsonFile: string) {
  // Reuse parsed JSON while the file modification time is unchanged.
  const resolved = resolveDiseaseJsonPath(jsonFile);
  const stats = await fs.stat(resolved);
  const cached = diseaseJsonCache.get(resolved);
  if (cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.data;
  }

  const content = await fs.readFile(resolved, "utf8");
  const parsed = JSON.parse(content);
  const validation = diseaseResultJsonSchema.safeParse(parsed);

  if (!validation.success) {
    throw new Error("Invalid disease JSON structure");
  }

  diseaseJsonCache.set(resolved, {
    mtimeMs: stats.mtimeMs,
    data: validation.data
  });

  return validation.data;
}

export async function listDiseaseJsonCatalog() {
  // Cache a catalog snapshot to avoid repeated directory scans.
  const now = Date.now();
  if (catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.data;
  }

  const dataDir = getDiseaseDataDirectory();
  const entries = await fs.readdir(dataDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const settled = await Promise.allSettled(
    jsonFiles.map(async (fileName): Promise<DiseaseCatalogEntry> => {
      const jsonFile = path.join("data", "diseases", fileName).replace(/\\/g, "/");
      const data = await readDiseaseJson(jsonFile);
      return { jsonFile, data };
    })
  );

  const results = settled
    .filter((entry): entry is PromiseFulfilledResult<DiseaseCatalogEntry> => entry.status === "fulfilled")
    .map((entry) => entry.value);

  catalogCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    data: results
  };

  // Invalidate name index so it is rebuilt from the fresh catalog snapshot.
  diseaseNameIndexCache = null;
  return results;
}

async function buildDiseaseNameIndex() {
  const now = Date.now();
  if (diseaseNameIndexCache && diseaseNameIndexCache.expiresAt > now) {
    return diseaseNameIndexCache.data;
  }

  const catalog = await listDiseaseJsonCatalog();
  const byExactName = new Map<string, DiseaseResultJsonSchema>();
  const byNormalizedName: Array<{ normalized: string; data: DiseaseResultJsonSchema }> = [];

  for (const { data } of catalog) {
    const normalized = normalizeDiseaseName(data.disease_name);
    if (!normalized) continue;

    if (!byExactName.has(normalized)) {
      byExactName.set(normalized, data);
      byNormalizedName.push({ normalized, data });
    }
  }

  const index = { byExactName, byNormalizedName };
  diseaseNameIndexCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    data: index
  };
  return index;
}

export async function findDiseaseJsonByName(name: string) {
  const normalized = normalizeDiseaseName(name);
  if (!normalized) return null;

  const index = await buildDiseaseNameIndex();
  const exact = index.byExactName.get(normalized);
  if (exact) {
    return exact;
  }

  const fuzzy = index.byNormalizedName.find(({ normalized: candidate }) => {
    return candidate.includes(normalized) || normalized.includes(candidate);
  });
  if (fuzzy) {
    return fuzzy.data;
  }

  const typoFriendly = index.byNormalizedName
    .map(({ data, normalized: candidate }) => ({
      data,
      distance: levenshteinDistance(normalized, candidate)
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (typoFriendly && typoFriendly.distance <= 2) {
    return typoFriendly.data;
  }

  return null;
}

/**
 * Clear in-memory disease catalog/index cache after admin mutations.
 */
export function invalidateDiseaseJsonCache() {
  catalogCache = null;
  diseaseNameIndexCache = null;
  diseaseJsonCache.clear();
}
