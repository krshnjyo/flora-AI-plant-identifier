/**
 * File: backend/lib/plant-resolver.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { Pool } from "mysql2/promise";
import { buildLowercaseCandidates, buildNameCandidates, normalizeIdentifiedName } from "@/lib/name-normalization";
import { toSqlBooleanFullText } from "@/lib/search";
import { scoreTextSimilarity } from "@/lib/resolver-scoring";

export type ResolvedPlantMatch = {
  plant_id: number;
  common_name: string;
  scientific_name: string;
  species: string;
  confidence_score: number;
  json_file: string | null;
  matched_alias: string | null;
  score: number;
};

type PlantCandidateRow = {
  plant_id: number;
  common_name: string;
  scientific_name: string;
  species: string;
  confidence_score: number;
  json_file: string | null;
  alias_name: string | null;
};

type PlantAggregate = Omit<ResolvedPlantMatch, "matched_alias" | "score"> & {
  alias_set: Set<string>;
};

function normalizeText(value: string) {
  return normalizeIdentifiedName(value).toLowerCase();
}

async function runAdvancedPlantQuery(pool: Pool, searchCandidates: string[]) {
  const whereClause = searchCandidates
    .map(
      () =>
        "(p.common_name_norm = ? OR p.scientific_name_norm = ? OR p.species_norm = ? OR pa.alias_name_norm = ? OR p.common_name_norm LIKE ? OR p.scientific_name_norm LIKE ? OR p.species_norm LIKE ? OR pa.alias_name_norm LIKE ? OR (? <> '' AND MATCH(p.common_name, p.scientific_name, p.species) AGAINST (? IN BOOLEAN MODE)))"
    )
    .join(" OR ");

  const sql = `SELECT p.plant_id, p.common_name, p.scientific_name, p.species, p.confidence_score, p.json_file,
                      pa.alias_name
               FROM plants p
               LEFT JOIN plant_aliases pa ON pa.plant_id = p.plant_id
               WHERE ${whereClause}
               LIMIT 800`;

  const params: string[] = [];
  for (const candidate of searchCandidates) {
    const fullText = toSqlBooleanFullText(candidate);
    params.push(
      candidate,
      candidate,
      candidate,
      candidate,
      `%${candidate}%`,
      `%${candidate}%`,
      `%${candidate}%`,
      `%${candidate}%`,
      fullText,
      fullText
    );
  }

  const [rows] = await pool.execute(sql, params);
  return rows as PlantCandidateRow[];
}

async function runLegacyPlantQuery(pool: Pool, searchCandidates: string[]) {
  const whereClause = searchCandidates
    .map(() => "(LOWER(common_name) = ? OR LOWER(scientific_name) = ? OR LOWER(species) = ? OR LOWER(common_name) LIKE ? OR LOWER(scientific_name) LIKE ? OR LOWER(species) LIKE ?)")
    .join(" OR ");

  const sql = `SELECT plant_id, common_name, scientific_name, species, confidence_score, json_file,
                      NULL AS alias_name
               FROM plants
               WHERE ${whereClause}
               LIMIT 400`;

  const params: string[] = [];
  for (const candidate of searchCandidates) {
    params.push(candidate, candidate, candidate, `%${candidate}%`, `%${candidate}%`, `%${candidate}%`);
  }

  const [rows] = await pool.execute(sql, params);
  return rows as PlantCandidateRow[];
}

function aggregateRows(rows: PlantCandidateRow[]) {
  const byPlant = new Map<number, PlantAggregate>();

  for (const row of rows) {
    if (!byPlant.has(row.plant_id)) {
      byPlant.set(row.plant_id, {
        plant_id: row.plant_id,
        common_name: row.common_name,
        scientific_name: row.scientific_name,
        species: row.species,
        confidence_score: Number(row.confidence_score || 0),
        json_file: row.json_file || null,
        alias_set: new Set()
      });
    }

    if (row.alias_name) {
      const candidate = byPlant.get(row.plant_id);
      if (candidate) {
        candidate.alias_set.add(normalizeText(row.alias_name));
      }
    }
  }

  return Array.from(byPlant.values());
}

function scorePlant(candidate: PlantAggregate, searchCandidates: string[]) {
  const fields = [candidate.common_name, candidate.scientific_name, candidate.species].map(normalizeText);

  let score = 0;
  let matchedAlias: string | null = null;

  for (const input of searchCandidates) {
    for (const field of fields) {
      score += scoreTextSimilarity(field, input, {
        exact: 120,
        contains: 72,
        typoBase: 40,
        typoPenalty: 8,
        typoMaxDistance: 2
      });
    }

    for (const alias of candidate.alias_set) {
      const aliasScore = scoreTextSimilarity(alias, input, {
        exact: 114,
        contains: 66,
        typoBase: 34,
        typoPenalty: 8,
        typoMaxDistance: 2
      });
      if (aliasScore > 0) {
        score += aliasScore;
        matchedAlias = matchedAlias || alias;
      }
    }
  }

  return { score, matchedAlias };
}

export async function resolvePlantMatch(pool: Pool, label: string) {
  const searchCandidates = buildLowercaseCandidates(buildNameCandidates(label));
  if (searchCandidates.length === 0) {
    return null;
  }

  let rows: PlantCandidateRow[];
  try {
    rows = (await runAdvancedPlantQuery(pool, searchCandidates));
  } catch (error) {
    const code = (error as { code?: string }).code || "";
    if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_PARSE_ERROR"].includes(code)) {
      rows = await runLegacyPlantQuery(pool, searchCandidates);
    } else {
      throw error;
    }
  }

  if (!rows || rows.length === 0) {
    return null;
  }

  const aggregated = aggregateRows(rows);
  const ranked = aggregated
    .map((candidate) => {
      const { score, matchedAlias } = scorePlant(candidate, searchCandidates);
      return {
        ...candidate,
        score,
        matchedAlias
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.common_name.length !== b.common_name.length) return a.common_name.length - b.common_name.length;
      return a.common_name.localeCompare(b.common_name);
    });

  const best = ranked[0];
  if (!best || best.score < 22) {
    return null;
  }

  return {
    plant_id: best.plant_id,
    common_name: best.common_name,
    scientific_name: best.scientific_name,
    species: best.species,
    confidence_score: best.confidence_score,
    json_file: best.json_file,
    matched_alias: best.matchedAlias,
    score: best.score
  };
}
