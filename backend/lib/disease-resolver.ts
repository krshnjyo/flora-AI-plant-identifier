/**
 * File: backend/lib/disease-resolver.ts
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

export type ResolvedDiseaseMatch = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  disease_description: string;
  symptoms: string;
  causes: string;
  prevention_methods: string;
  treatment_methods: string;
  severity_level: string;
  json_file: string | null;
  primary_plant_id: number | null;
  primary_plant_name: string | null;
  matched_alias: string | null;
  linked_plant_ids: number[];
  linked_plant_names: string[];
  score: number;
};

type ResolverOptions = {
  plantId?: number | null;
  plantHints?: string[];
};

type DiseaseCandidateRow = {
  disease_id: number;
  disease_name: string;
  affected_species: string;
  disease_description: string;
  symptoms: string;
  causes: string;
  prevention_methods: string;
  treatment_methods: string;
  severity_level: string;
  json_file: string | null;
  primary_plant_id: number | null;
  primary_plant_name: string | null;
  alias_name: string | null;
  linked_plant_id: number | null;
  linked_plant_name: string | null;
};

type DiseaseAggregate = Omit<ResolvedDiseaseMatch, "matched_alias" | "score"> & {
  alias_set: Set<string>;
  linked_plant_id_set: Set<number>;
  linked_plant_name_set: Set<string>;
};

function normalizeText(value: string) {
  return normalizeIdentifiedName(value).toLowerCase();
}

function buildSearchCandidates(input: string) {
  return buildLowercaseCandidates(buildNameCandidates(input));
}

function aggregateDiseaseRows(rows: DiseaseCandidateRow[]) {
  const byDisease = new Map<number, DiseaseAggregate>();

  for (const row of rows) {
    const existing = byDisease.get(row.disease_id);
    if (!existing) {
      byDisease.set(row.disease_id, {
        disease_id: row.disease_id,
        disease_name: row.disease_name,
        affected_species: row.affected_species || "",
        disease_description: row.disease_description || "",
        symptoms: row.symptoms || "",
        causes: row.causes || "",
        prevention_methods: row.prevention_methods || "",
        treatment_methods: row.treatment_methods || "",
        severity_level: row.severity_level || "",
        json_file: row.json_file || null,
        primary_plant_id: row.primary_plant_id || null,
        primary_plant_name: row.primary_plant_name || null,
        linked_plant_ids: [],
        linked_plant_names: [],
        alias_set: new Set<string>(),
        linked_plant_id_set: new Set<number>(),
        linked_plant_name_set: new Set<string>()
      });
    }

    const aggregate = byDisease.get(row.disease_id);
    if (!aggregate) continue;

    if (row.alias_name) {
      const alias = normalizeText(row.alias_name);
      if (alias) aggregate.alias_set.add(alias);
    }

    if (typeof row.linked_plant_id === "number" && row.linked_plant_id > 0) {
      aggregate.linked_plant_id_set.add(row.linked_plant_id);
    }

    if (row.linked_plant_name) {
      const linkedName = row.linked_plant_name.trim();
      if (linkedName) {
        aggregate.linked_plant_name_set.add(linkedName);
      }
    }
  }

  return Array.from(byDisease.values()).map((item) => ({
    ...item,
    linked_plant_ids: Array.from(item.linked_plant_id_set),
    linked_plant_names: Array.from(item.linked_plant_name_set)
  }));
}

function scoreDisease(
  disease: DiseaseAggregate,
  searchCandidates: string[],
  options: ResolverOptions
): { score: number; matchedAlias: string | null } {
  const diseaseName = normalizeText(disease.disease_name);
  const affectedSpecies = normalizeText(disease.affected_species || "");
  const plantHints = (options.plantHints || []).map((hint) => normalizeText(hint)).filter(Boolean);

  let score = 0;
  let matchedAlias: string | null = null;

  for (const candidate of searchCandidates) {
    if (!candidate) continue;

    score += scoreTextSimilarity(diseaseName, candidate, {
      exact: 120,
      contains: 72,
      typoBase: 42,
      typoPenalty: 8,
      typoMaxDistance: 2
    });

    for (const alias of disease.alias_set) {
      const aliasScore = scoreTextSimilarity(alias, candidate, {
        exact: 116,
        contains: 68,
        typoBase: 36,
        typoPenalty: 8,
        typoMaxDistance: 2
      });
      if (aliasScore > 0) {
        score += aliasScore;
        matchedAlias = matchedAlias || alias;
      }
    }
  }

  if (options.plantId && options.plantId > 0) {
    if (disease.primary_plant_id === options.plantId) {
      score += 32;
    }
    if (disease.linked_plant_ids.includes(options.plantId)) {
      score += 38;
    }
  }

  const linkedPlantNamesNormalized = disease.linked_plant_names.map((name) => normalizeText(name));
  for (const hint of plantHints) {
    if (!hint) continue;

    if (affectedSpecies.includes(hint) || hint.includes(affectedSpecies)) {
      score += 18;
    }

    if (disease.primary_plant_name && normalizeText(disease.primary_plant_name).includes(hint)) {
      score += 14;
    }

    if (linkedPlantNamesNormalized.some((linked) => linked.includes(hint) || hint.includes(linked))) {
      score += 16;
    }
  }

  if (disease.json_file) {
    score += 4;
  }

  return { score, matchedAlias };
}

async function runAdvancedDiseaseQuery(pool: Pool, searchCandidates: string[]) {
  const whereClause = searchCandidates
    .map(
      () =>
        "(pd.disease_name_norm = ? OR pd.disease_name_norm LIKE ? OR da.alias_name_norm = ? OR da.alias_name_norm LIKE ? OR (? <> '' AND MATCH(pd.disease_name, pd.affected_species, pd.disease_description, pd.symptoms, pd.causes) AGAINST (? IN BOOLEAN MODE)))"
    )
    .join(" OR ");

  const sql = `SELECT pd.disease_id, pd.disease_name, pd.affected_species, pd.disease_description,
                      pd.symptoms, pd.causes, pd.prevention_methods, pd.treatment_methods,
                      pd.severity_level, pd.json_file, pd.primary_plant_id,
                      pp.common_name AS primary_plant_name,
                      da.alias_name,
                      pdm.plant_id AS linked_plant_id,
                      lp.common_name AS linked_plant_name
               FROM plant_diseases pd
               LEFT JOIN disease_aliases da ON da.disease_id = pd.disease_id
               LEFT JOIN plant_disease_map pdm ON pdm.disease_id = pd.disease_id
               LEFT JOIN plants lp ON lp.plant_id = pdm.plant_id
               LEFT JOIN plants pp ON pp.plant_id = pd.primary_plant_id
               WHERE ${whereClause}
               LIMIT 800`;

  const params: string[] = [];
  for (const candidate of searchCandidates) {
    const fullText = toSqlBooleanFullText(candidate);
    params.push(candidate, `%${candidate}%`, candidate, `%${candidate}%`, fullText, fullText);
  }

  const [rows] = await pool.execute(sql, params);
  return rows as DiseaseCandidateRow[];
}

async function runLegacyDiseaseQuery(pool: Pool, searchCandidates: string[]) {
  const whereClause = searchCandidates
    .map(() => "(LOWER(disease_name) = ? OR LOWER(disease_name) LIKE ?)")
    .join(" OR ");

  const sql = `SELECT disease_id, disease_name, affected_species, disease_description, symptoms,
                      causes, prevention_methods, treatment_methods, severity_level,
                      NULL AS json_file,
                      NULL AS primary_plant_id,
                      NULL AS primary_plant_name,
                      NULL AS alias_name,
                      NULL AS linked_plant_id,
                      NULL AS linked_plant_name
               FROM plant_diseases
               WHERE ${whereClause}
               LIMIT 400`;

  const params: string[] = [];
  for (const candidate of searchCandidates) {
    params.push(candidate, `%${candidate}%`);
  }

  const [rows] = await pool.execute(sql, params);
  return rows as DiseaseCandidateRow[];
}

export async function resolveDiseaseMatch(pool: Pool, diseaseLabel: string, options: ResolverOptions = {}) {
  const searchCandidates = buildSearchCandidates(diseaseLabel);
  if (searchCandidates.length === 0) {
    return null;
  }

  let rows: DiseaseCandidateRow[] = [];

  try {
    rows = await runAdvancedDiseaseQuery(pool, searchCandidates);
  } catch (error) {
    const mysqlCode = (error as { code?: string }).code || "";
    if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR", "ER_PARSE_ERROR"].includes(mysqlCode)) {
      rows = await runLegacyDiseaseQuery(pool, searchCandidates);
    } else {
      throw error;
    }
  }

  if (rows.length === 0) {
    return null;
  }

  const aggregated = aggregateDiseaseRows(rows);
  const ranked = aggregated
    .map((candidate) => {
      const { score, matchedAlias } = scoreDisease(candidate, searchCandidates, options);
      return {
        ...candidate,
        matchedAlias,
        score
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.disease_name.length !== b.disease_name.length) return a.disease_name.length - b.disease_name.length;
      return a.disease_name.localeCompare(b.disease_name);
    });

  const best = ranked[0];
  if (!best || best.score < 24) {
    return null;
  }

  return {
    disease_id: best.disease_id,
    disease_name: best.disease_name,
    affected_species: best.affected_species,
    disease_description: best.disease_description,
    symptoms: best.symptoms,
    causes: best.causes,
    prevention_methods: best.prevention_methods,
    treatment_methods: best.treatment_methods,
    severity_level: best.severity_level,
    json_file: best.json_file,
    primary_plant_id: best.primary_plant_id,
    primary_plant_name: best.primary_plant_name,
    matched_alias: best.matchedAlias,
    linked_plant_ids: best.linked_plant_ids,
    linked_plant_names: best.linked_plant_names,
    score: best.score
  } satisfies ResolvedDiseaseMatch;
}
