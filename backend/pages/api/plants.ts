/**
 * File: backend/pages/api/plants.ts
 * Purpose: Returns searchable plant list data for gallery/admin consumers.
 *
 * Responsibilities:
 * - Merges DB catalog rows with local JSON fallback catalog entries.
 * - Resolves image URLs only when corresponding public assets exist.
 * - Supports case-insensitive search while keeping response shape consistent.
 */

import fs from "fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { getPool } from "@/lib/db";
import { listPlantJsonCatalog } from "@/lib/plant-json";
import { sendSuccess } from "@/lib/response";
import { normalizeSearchTerm, toSqlContainsPattern } from "@/lib/search";
import { backendPath } from "@/lib/backend-root";
import { buildVersionedCacheKey, getCachedJson, setCachedJson } from "@/lib/request-cache";
import { buildPublicImageIndex, type PublicImageIndex, resolvePreferredImageUrl } from "@/lib/catalog-image";

type PlantListRow = {
  plant_id: number;
  common_name: string;
  scientific_name: string;
  species: string;
  confidence_score: number;
  json_file: string | null;
};

type PlantListItem = Omit<PlantListRow, "json_file"> & {
  image_url: string | null;
};

type PlantCatalogSnapshot = {
  items: PlantListItem[];
  imageByJsonFile: Map<string, string>;
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

/**
 * Build a catalog snapshot once per request so DB merge can reuse:
 * - Sorted, filtered local JSON items
 * - A fast O(1) lookup map from `json_file` to image URL
 */
function buildCatalogSnapshot(search: string, startPlantId = 100_000): Promise<PlantCatalogSnapshot> {
  return Promise.all([listPlantJsonCatalog(), getPublicPlantImageIndexes()]).then(([catalog, imageIndexes]) => {
    const imageByJsonFile = new Map<string, string>();
    const allItems = catalog.map(({ jsonFile, data }, index): PlantListItem => {
      const imageUrl = resolvePlantImageUrl(imageIndexes, data.common_name, {
        aliases: [data.scientific_name, data.species],
        declaredImageUrl: data.image_url || null
      });
      if (imageUrl) {
        imageByJsonFile.set(jsonFile, imageUrl);
      }

      return {
        plant_id: typeof data.plant_id === "number" && data.plant_id > 0 ? data.plant_id : startPlantId + index,
        common_name: data.common_name,
        scientific_name: data.scientific_name,
        species: data.species,
        confidence_score: data.confidence_score,
        image_url: imageUrl
      };
    });

    const items = !search
      ? allItems
      : allItems.filter((item) =>
          [item.common_name, item.scientific_name, item.species].some((field) =>
            field.toLowerCase().includes(search)
          )
        );

    return {
      items: items.sort((a, b) => a.common_name.localeCompare(b.common_name)),
      imageByJsonFile
    };
  });
}

export default withMethods(["GET"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Normalize search once and reuse for JSON and SQL paths.
  const search = normalizeSearchTerm(req.query.search);
  const cacheKey = await buildVersionedCacheKey("plants", `api:plants:v1:${search || "all"}`);
  const cached = await getCachedJson<PlantListItem[]>(cacheKey);
  if (cached) {
    return sendSuccess(res, cached);
  }
  const searchPattern = toSqlContainsPattern(search);
  const catalog = await buildCatalogSnapshot(search);
  const catalogPlants = catalog.items;
  const allowedCatalogKeys = new Set(catalogPlants.map((item) => normalizeSearchTerm(item.common_name)));

  try {
    const [rows] = await getPool().execute(
      `SELECT plant_id, common_name, scientific_name, species, confidence_score, json_file
       FROM plants
       WHERE (? = '' OR common_name ILIKE ? ESCAPE '\\'
          OR scientific_name ILIKE ? ESCAPE '\\'
          OR species ILIKE ? ESCAPE '\\')
       ORDER BY common_name ASC
       LIMIT 100`,
      [search, searchPattern, searchPattern, searchPattern]
    );

    const rowData = rows as PlantListRow[];
    const plantsWithImages = rowData
      .map(({ json_file, ...plant }): PlantListItem => ({
        ...plant,
        image_url: json_file ? catalog.imageByJsonFile.get(json_file) ?? null : null
      }))
      .filter((item) => allowedCatalogKeys.has(normalizeSearchTerm(item.common_name)));

    const byKey = new Map<string, PlantListItem>();
    plantsWithImages.forEach((item) => {
      byKey.set(normalizeSearchTerm(item.common_name), item);
    });
    catalogPlants.forEach((item) => {
      const key = normalizeSearchTerm(item.common_name);
      if (!byKey.has(key)) {
        byKey.set(key, item);
      }
    });

    const payload = Array.from(byKey.values())
      .sort((a, b) => a.common_name.localeCompare(b.common_name))
      .slice(0, 200);
    await setCachedJson(cacheKey, payload, 45);
    return sendSuccess(res, payload);
  } catch {
    // If DB is unavailable or empty, allow gallery/listing to work from local JSON catalog.
  }

  await setCachedJson(cacheKey, catalogPlants, 45);
  return sendSuccess(res, catalogPlants);
});
