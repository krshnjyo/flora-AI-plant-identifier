/**
 * File: backend/pages/api/diseases.ts
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

import fs from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { getPool } from "@/lib/db";
import { listDiseaseJsonCatalog } from "@/lib/disease-json";
import { sendSuccess } from "@/lib/response";
import { normalizeSearchTerm, toSqlContainsPattern } from "@/lib/search";
import { backendPath } from "@/lib/backend-root";
import { buildVersionedCacheKey, getCachedJson, setCachedJson } from "@/lib/request-cache";
import { buildPublicImageIndex, type PublicImageIndex, resolvePreferredImageUrl } from "@/lib/catalog-image";

type DiseaseListRow = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  severity_level: string;
  image_url: string | null;
  json_file?: string | null;
};

const MAX_DISEASE_LIST_ROWS = 200;

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

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const search = normalizeSearchTerm(req.query.search);
  const cacheKey = await buildVersionedCacheKey("diseases", `api:diseases:v1:${search || "all"}`);
  const cached = await getCachedJson<DiseaseListRow[]>(cacheKey);
  if (cached) {
    return sendSuccess(
      res,
      cached.map((item) => ({
        disease_id: item.disease_id,
        disease_name: item.disease_name,
        affected_species: item.affected_species,
        severity_level: item.severity_level,
        image_url: item.image_url
      }))
    );
  }
  const searchPattern = toSqlContainsPattern(search);
  const [catalog, imageIndexes] = await Promise.all([listDiseaseJsonCatalog(), getPublicDiseaseImageIndexes()]);
  const imageByJsonFile = new Map<string, string>();
  const catalogRows = catalog
    .map(({ jsonFile, data }, index): DiseaseListRow => {
      const imageUrl = resolveDiseaseImageUrl(imageIndexes, data.disease_name, {
        declaredImageUrl: data.image_url || null
      });
      if (imageUrl) {
        imageByJsonFile.set(jsonFile, imageUrl);
      }
      return {
        disease_id: index + 1_000_000,
        disease_name: data.disease_name,
        affected_species: data.affected_species,
        severity_level: data.severity_level,
        image_url: imageUrl
      };
    });
  const allowedDiseaseNames = new Set(catalogRows.map((row) => row.disease_name.toLowerCase()));

  try {
    const [rows] = await getPool().execute(
      `SELECT disease_id, disease_name, affected_species, severity_level, json_file
       FROM plant_diseases
       WHERE (? = '' OR disease_name ILIKE ? ESCAPE '\\'
          OR affected_species ILIKE ? ESCAPE '\\'
          OR disease_description ILIKE ? ESCAPE '\\'
          OR symptoms ILIKE ? ESCAPE '\\'
          OR causes ILIKE ? ESCAPE '\\')
       ORDER BY disease_name ASC
       LIMIT ${MAX_DISEASE_LIST_ROWS}`,
      [search, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern]
    );

    const dbRowsRaw = rows as DiseaseListRow[];
    const dbRows = dbRowsRaw.map((row): DiseaseListRow => ({
      ...row,
      image_url: row.json_file ? imageByJsonFile.get(row.json_file) || null : null
    }));

    const byName = new Map<string, DiseaseListRow>();
    dbRows
      .filter((row) => allowedDiseaseNames.has(row.disease_name.toLowerCase()))
      .forEach((row) => byName.set(row.disease_name.toLowerCase(), row));
    catalogRows.forEach((row) => {
      const key = row.disease_name.toLowerCase();
      if (!byName.has(key)) {
        byName.set(key, row);
      }
    });

    const merged = Array.from(byName.values())
      .filter((item) => (search ? item.disease_name.toLowerCase().includes(search) : true))
      .sort((a, b) => a.disease_name.localeCompare(b.disease_name))
      .slice(0, MAX_DISEASE_LIST_ROWS);

    const payload = merged.map((item) => ({
      disease_id: item.disease_id,
      disease_name: item.disease_name,
      affected_species: item.affected_species,
      severity_level: item.severity_level,
      image_url: item.image_url
    }));
    await setCachedJson(cacheKey, payload, 45);
    return sendSuccess(res, payload);
  } catch {
    // Fall through to local disease JSON fallback when DB is unavailable.
  }

  const localRows = catalogRows
    .filter((item) => (search ? item.disease_name.toLowerCase().includes(search) : true))
    .sort((a, b) => a.disease_name.localeCompare(b.disease_name))
    .slice(0, MAX_DISEASE_LIST_ROWS);

  const payload = localRows.map((item) => ({
    disease_id: item.disease_id,
    disease_name: item.disease_name,
    affected_species: item.affected_species,
    severity_level: item.severity_level,
    image_url: item.image_url
  }));
  await setCachedJson(cacheKey, payload, 45);
  return sendSuccess(res, payload);
});
