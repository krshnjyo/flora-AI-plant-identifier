/**
 * File: backend/scripts/sync-catalog.mjs
 * Purpose: Synchronize JSON catalog content into the PostgreSQL database.
 *
 * Responsibilities:
 * - Ensures the PostgreSQL schema is applied before syncing catalog data.
 * - Deduplicates catalog rows that may have been created by earlier imports.
 * - Upserts plants, diseases, aliases, and plant-disease mappings from JSON.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(SCRIPT_DIR, "..");
const ENV_PATH = path.join(BACKEND_DIR, ".env.local");
const SCHEMA_PATH = path.join(BACKEND_DIR, "database", "schema.pg.sql");
const PLANTS_DIR = path.join(BACKEND_DIR, "data", "plants");
const DISEASES_DIR = path.join(BACKEND_DIR, "data", "diseases");

function readLocalEnv(filePath) {
  const env = {};
  return fs
    .readFile(filePath, "utf8")
    .then((content) => {
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const splitAt = trimmed.indexOf("=");
        if (splitAt <= 0) continue;
        const key = trimmed.slice(0, splitAt).trim();
        const value = trimmed.slice(splitAt + 1).trim();
        env[key] = value;
      }
      return env;
    })
    .catch(() => env);
}

function readDatabaseUrl(localEnv) {
  const databaseUrl = String(process.env.DATABASE_URL || localEnv.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("Missing required DB env var: DATABASE_URL");
  }
  return databaseUrl;
}

function isLocalDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function convertQuestionPlaceholders(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeParams(params = []) {
  return params.map((value) => (value === undefined ? null : value));
}

function preparePgQuery(sql, params = []) {
  return {
    text: convertQuestionPlaceholders(sql),
    values: normalizeParams(params)
  };
}

async function createConnection(databaseUrl) {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: isLocalDatabaseUrl(databaseUrl) ? false : { rejectUnauthorized: true }
  });

  await client.connect();

  return {
    async query(sql, params = []) {
      const prepared = preparePgQuery(sql, params);
      const result = await client.query(prepared.text, prepared.values);
      return [result.rows, result];
    },
    async execute(sql, params = []) {
      const prepared = preparePgQuery(sql, params);
      const result = await client.query(prepared.text, prepared.values);
      return [result.rows, result];
    },
    beginTransaction() {
      return client.query("BEGIN");
    },
    commit() {
      return client.query("COMMIT");
    },
    rollback() {
      return client.query("ROLLBACK");
    },
    end() {
      return client.end();
    },
    rawQuery(sql) {
      return client.query(sql);
    }
  };
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,:;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSpeciesTokens(raw) {
  return String(raw || "")
    .split(/[,/|;]/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*)::int AS count
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ?`,
    [tableName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function applySchema(connection) {
  const schemaSql = await fs.readFile(SCHEMA_PATH, "utf8");
  await connection.rawQuery(schemaSql);
}

function pickKeeper(rows, keyField) {
  return [...rows].sort((a, b) => {
    const aHasJson = a.json_file ? 1 : 0;
    const bHasJson = b.json_file ? 1 : 0;
    if (bHasJson !== aHasJson) return bHasJson - aHasJson;
    if (a[keyField] && !b[keyField]) return -1;
    if (!a[keyField] && b[keyField]) return 1;
    return a.id - b.id;
  })[0];
}

async function dedupeCatalogRows(connection) {
  const [plantRows] = await connection.execute(
    `SELECT plant_id AS id, scientific_name, json_file
     FROM plants`
  );

  const plantsByScientific = new Map();
  for (const row of plantRows) {
    const key = normalizeText(row.scientific_name);
    if (!key) continue;
    if (!plantsByScientific.has(key)) plantsByScientific.set(key, []);
    plantsByScientific.get(key).push(row);
  }

  for (const rows of plantsByScientific.values()) {
    if (rows.length <= 1) continue;
    const keeper = pickKeeper(rows, "scientific_name");
    const duplicates = rows.filter((row) => row.id !== keeper.id);

    for (const duplicate of duplicates) {
      await connection.execute(
        `INSERT INTO plant_aliases (plant_id, alias_name)
         SELECT ?, alias_name FROM plant_aliases WHERE plant_id = ?
         ON CONFLICT (alias_name) DO UPDATE
         SET plant_id = EXCLUDED.plant_id`,
        [keeper.id, duplicate.id]
      );
      await connection.execute(`DELETE FROM plant_aliases WHERE plant_id = ?`, [duplicate.id]);

      await connection.execute(
        `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
         SELECT ?, disease_id, relation_type, source FROM plant_disease_map WHERE plant_id = ?
         ON CONFLICT (plant_id, disease_id) DO UPDATE
         SET relation_type = EXCLUDED.relation_type,
             source = EXCLUDED.source`,
        [keeper.id, duplicate.id]
      );
      await connection.execute(`DELETE FROM plant_disease_map WHERE plant_id = ?`, [duplicate.id]);

      await connection.execute(`UPDATE plant_diseases SET primary_plant_id = ? WHERE primary_plant_id = ?`, [keeper.id, duplicate.id]);
      await connection.execute(`UPDATE scan_history SET plant_id = ? WHERE plant_id = ?`, [keeper.id, duplicate.id]);
      await connection.execute(`DELETE FROM plants WHERE plant_id = ?`, [duplicate.id]);
    }
  }

  const [diseaseRows] = await connection.execute(
    `SELECT disease_id AS id, disease_name, json_file
     FROM plant_diseases`
  );

  const diseasesByName = new Map();
  for (const row of diseaseRows) {
    const key = normalizeText(row.disease_name);
    if (!key) continue;
    if (!diseasesByName.has(key)) diseasesByName.set(key, []);
    diseasesByName.get(key).push(row);
  }

  for (const rows of diseasesByName.values()) {
    if (rows.length <= 1) continue;
    const keeper = pickKeeper(rows, "disease_name");
    const duplicates = rows.filter((row) => row.id !== keeper.id);

    for (const duplicate of duplicates) {
      await connection.execute(
        `INSERT INTO disease_aliases (disease_id, alias_name)
         SELECT ?, alias_name FROM disease_aliases WHERE disease_id = ?
         ON CONFLICT (alias_name) DO UPDATE
         SET disease_id = EXCLUDED.disease_id`,
        [keeper.id, duplicate.id]
      );
      await connection.execute(`DELETE FROM disease_aliases WHERE disease_id = ?`, [duplicate.id]);

      await connection.execute(
        `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
         SELECT plant_id, ?, relation_type, source FROM plant_disease_map WHERE disease_id = ?
         ON CONFLICT (plant_id, disease_id) DO UPDATE
         SET relation_type = EXCLUDED.relation_type,
             source = EXCLUDED.source`,
        [keeper.id, duplicate.id]
      );
      await connection.execute(`DELETE FROM plant_disease_map WHERE disease_id = ?`, [duplicate.id]);

      await connection.execute(`UPDATE scan_history SET disease_id = ? WHERE disease_id = ?`, [keeper.id, duplicate.id]);
      await connection.execute(`DELETE FROM plant_diseases WHERE disease_id = ?`, [duplicate.id]);
    }
  }
}

async function readCatalogDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const results = [];
  for (const fileName of files) {
    const absolutePath = path.join(dirPath, fileName);
    try {
      const raw = await fs.readFile(absolutePath, "utf8");
      const parsed = JSON.parse(raw);
      results.push({ fileName, data: parsed });
    } catch (error) {
      console.warn(`Skipped invalid JSON: ${absolutePath} (${error.message})`);
    }
  }

  return results;
}

function buildPlantLookup(plantRows) {
  const lookup = new Map();

  for (const row of plantRows) {
    const keys = [row.common_name, row.scientific_name, row.species].map(normalizeText).filter(Boolean);
    for (const key of keys) {
      if (!lookup.has(key)) {
        lookup.set(key, row.plant_id);
      }
    }
  }

  return lookup;
}

function resolvePlantIdFromText(plantLookup, text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  if (plantLookup.has(normalized)) {
    return plantLookup.get(normalized);
  }

  for (const [key, plantId] of plantLookup.entries()) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return plantId;
    }
  }

  return null;
}

function buildDiseaseAliases(diseaseName, affectedSpecies) {
  const aliases = new Set();
  const normalizedName = normalizeText(diseaseName);
  if (normalizedName) aliases.add(normalizedName);

  const curatedAliases = {
    "late blight": [
      "phytophthora",
      "phytophthora infestans",
      "potato late blight",
      "tomato late blight"
    ],
    "early blight": ["alternaria", "alternaria solani", "potato early blight", "tomato early blight"],
    "powdery mildew": ["mildew"],
    "rice blast": ["blast"],
    "fusarium wilt": ["fusarium"]
  };

  const curated = curatedAliases[normalizedName] || [];
  for (const alias of curated) aliases.add(alias);

  for (const speciesToken of splitSpeciesTokens(affectedSpecies)) {
    const normalizedSpecies = normalizeText(speciesToken);
    if (normalizedSpecies) {
      aliases.add(`${normalizedSpecies} ${normalizedName}`.trim());
    }
  }

  return Array.from(aliases).filter((alias) => alias.length >= 3);
}

function buildPlantAliases(commonName, scientificName, species) {
  const aliases = new Set();
  const common = normalizeText(commonName);
  const scientific = normalizeText(scientificName);
  const speciesName = normalizeText(species);

  for (const base of [common, scientific, speciesName]) {
    if (!base) continue;
    aliases.add(base);
    aliases.add(`${base} leaf`);
    aliases.add(`${base} plant`);
  }

  for (const item of Array.from(aliases)) {
    aliases.add(item.replace(/\s+/g, " ").trim());
    aliases.add(item.replace(/\s+/g, ""));
  }

  return Array.from(aliases).filter((alias) => alias.length >= 2);
}

async function upsertCatalog(connection) {
  const plantCatalog = await readCatalogDirectory(PLANTS_DIR);
  const diseaseCatalog = await readCatalogDirectory(DISEASES_DIR);

  let syncedPlants = 0;
  let syncedDiseases = 0;
  let syncedPlantAliases = 0;
  let syncedAliases = 0;
  let syncedMappings = 0;

  for (const { fileName, data } of plantCatalog) {
    const commonName = String(data.common_name || "").trim();
    const scientificName = String(data.scientific_name || "").trim();
    const species = String(data.species || "").trim();
    const confidenceScore = safeNumber(data.confidence_score, 0);

    if (!commonName || !scientificName || !species) {
      continue;
    }

    const jsonFile = path.join("data", "plants", fileName).replace(/\\/g, "/");
    const [existingPlantRows] = await connection.execute(
      `SELECT plant_id
       FROM plants
       WHERE LOWER(scientific_name) = LOWER(?)
       ORDER BY plant_id ASC
       LIMIT 1`,
      [scientificName]
    );

    const existingPlantId = existingPlantRows[0]?.plant_id || null;
    if (existingPlantId) {
      await connection.execute(
        `UPDATE plants
         SET common_name = ?, scientific_name = ?, species = ?, confidence_score = ?, json_file = ?
         WHERE plant_id = ?`,
        [commonName, scientificName, species, confidenceScore, jsonFile, existingPlantId]
      );
    } else {
      await connection.execute(
        `INSERT INTO plants (common_name, scientific_name, species, confidence_score, json_file)
         VALUES (?, ?, ?, ?, ?)`,
        [commonName, scientificName, species, confidenceScore, jsonFile]
      );
    }

    syncedPlants += 1;
  }

  const [plantRows] = await connection.execute(
    `SELECT plant_id, common_name, scientific_name, species
     FROM plants`
  );
  const plantLookup = buildPlantLookup(plantRows);

  for (const plantRow of plantRows) {
    const aliases = buildPlantAliases(plantRow.common_name, plantRow.scientific_name, plantRow.species);
    for (const alias of aliases) {
      await connection.execute(
        `INSERT INTO plant_aliases (plant_id, alias_name)
         VALUES (?, ?)
         ON CONFLICT (alias_name) DO UPDATE
         SET plant_id = EXCLUDED.plant_id`,
        [plantRow.plant_id, alias]
      );
      syncedPlantAliases += 1;
    }
  }

  for (const { fileName, data } of diseaseCatalog) {
    const diseaseName = String(data.disease_name || "").trim();
    if (!diseaseName) continue;

    const affectedSpecies = String(data.affected_species || "").trim();
    const primaryPlantId =
      splitSpeciesTokens(affectedSpecies)
        .map((token) => resolvePlantIdFromText(plantLookup, token))
        .find(Boolean) || null;

    const jsonFile = path.join("data", "diseases", fileName).replace(/\\/g, "/");

    const diseaseDescription = String(data.disease_description || `${diseaseName} disease profile`);
    const symptoms = String(data.symptoms || "Symptoms not provided.");
    const causes = String(data.causes || "Causes not provided.");
    const preventionMethods = String(data.prevention_methods || "Prevention guidance not provided.");
    const treatmentMethods = String(data.treatment_methods || "Treatment guidance not provided.");
    const severityLevel = String(data.severity_level || "Medium");

    const [existingDiseaseRows] = await connection.execute(
      `SELECT disease_id
       FROM plant_diseases
       WHERE LOWER(disease_name) = LOWER(?)
       ORDER BY disease_id ASC
       LIMIT 1`,
      [diseaseName]
    );

    const existingDiseaseId = existingDiseaseRows[0]?.disease_id || null;
    if (existingDiseaseId) {
      await connection.execute(
        `UPDATE plant_diseases
         SET disease_name = ?, affected_species = ?, disease_description = ?, symptoms = ?, causes = ?,
             prevention_methods = ?, treatment_methods = ?, severity_level = ?, json_file = ?, primary_plant_id = ?
         WHERE disease_id = ?`,
        [
          diseaseName,
          affectedSpecies,
          diseaseDescription,
          symptoms,
          causes,
          preventionMethods,
          treatmentMethods,
          severityLevel,
          jsonFile,
          primaryPlantId,
          existingDiseaseId
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO plant_diseases (
          disease_name, affected_species, disease_description, symptoms, causes,
          prevention_methods, treatment_methods, severity_level, json_file, primary_plant_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          diseaseName,
          affectedSpecies,
          diseaseDescription,
          symptoms,
          causes,
          preventionMethods,
          treatmentMethods,
          severityLevel,
          jsonFile,
          primaryPlantId
        ]
      );
    }

    const [diseaseRows] = await connection.execute(
      `SELECT disease_id
       FROM plant_diseases
       WHERE LOWER(disease_name) = LOWER(?)
       LIMIT 1`,
      [diseaseName]
    );

    const diseaseRow = diseaseRows[0];
    if (!diseaseRow?.disease_id) {
      continue;
    }

    const aliases = buildDiseaseAliases(diseaseName, affectedSpecies);
    for (const alias of aliases) {
      await connection.execute(
        `INSERT INTO disease_aliases (disease_id, alias_name)
         VALUES (?, ?)
         ON CONFLICT (alias_name) DO UPDATE
         SET disease_id = EXCLUDED.disease_id`,
        [diseaseRow.disease_id, alias]
      );
      syncedAliases += 1;
    }

    syncedDiseases += 1;
  }

  await connection.execute(`DELETE FROM plant_disease_map WHERE source = 'json'`);

  for (const { data } of plantCatalog) {
    const plantName = String(data.common_name || "").trim();
    const plantId = resolvePlantIdFromText(plantLookup, plantName);
    if (!plantId) continue;

    const diseases = Array.isArray(data.common_diseases) ? data.common_diseases : [];
    for (const diseaseLabelRaw of diseases) {
      const diseaseLabel = normalizeText(diseaseLabelRaw);
      if (!diseaseLabel) continue;

      const [rows] = await connection.execute(
        `SELECT pd.disease_id
         FROM plant_diseases pd
         LEFT JOIN disease_aliases da ON da.disease_id = pd.disease_id
         WHERE LOWER(pd.disease_name) = ? OR LOWER(da.alias_name) = ?
         LIMIT 1`,
        [diseaseLabel, diseaseLabel]
      );

      const diseaseId = rows[0]?.disease_id;
      if (!diseaseId) continue;

      await connection.execute(
        `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
         VALUES (?, ?, 'common', 'json')
         ON CONFLICT (plant_id, disease_id) DO UPDATE
         SET relation_type = EXCLUDED.relation_type,
             source = EXCLUDED.source`,
        [plantId, diseaseId]
      );

      syncedMappings += 1;
    }
  }

  const [diseaseRows] = await connection.execute(
    `SELECT disease_id, affected_species, primary_plant_id
     FROM plant_diseases`
  );

  for (const disease of diseaseRows) {
    const speciesTokens = splitSpeciesTokens(disease.affected_species || "");
    for (const token of speciesTokens) {
      const plantId = resolvePlantIdFromText(plantLookup, token);
      if (!plantId) continue;

      await connection.execute(
        `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
         VALUES (?, ?, ?, 'json')
         ON CONFLICT (plant_id, disease_id) DO UPDATE
         SET relation_type = EXCLUDED.relation_type,
             source = EXCLUDED.source`,
        [plantId, disease.disease_id, disease.primary_plant_id === plantId ? "primary" : "possible"]
      );

      syncedMappings += 1;
    }
  }

  return {
    syncedPlants,
    syncedDiseases,
    syncedPlantAliases,
    syncedAliases,
    syncedMappings,
    plantFiles: plantCatalog.length,
    diseaseFiles: diseaseCatalog.length
  };
}

async function main() {
  const localEnv = await readLocalEnv(ENV_PATH);
  const databaseUrl = readDatabaseUrl(localEnv);
  const connection = await createConnection(databaseUrl);

  try {
    await applySchema(connection);

    const requiredTables = ["users", "plants", "plant_diseases", "scan_history"];
    for (const tableName of requiredTables) {
      if (!(await tableExists(connection, tableName))) {
        throw new Error(
          `Missing required table '${tableName}'. Run backend/database/schema.pg.sql first, then run npm run db:sync.`
        );
      }
    }

    await connection.beginTransaction();

    try {
      await dedupeCatalogRows(connection);
      const summary = await upsertCatalog(connection);
      await connection.commit();

      console.log("Catalog sync completed successfully.");
      console.log(`Plants JSON files: ${summary.plantFiles}, rows synced: ${summary.syncedPlants}`);
      console.log(`Plant aliases upserted: ${summary.syncedPlantAliases}`);
      console.log(`Diseases JSON files: ${summary.diseaseFiles}, rows synced: ${summary.syncedDiseases}`);
      console.log(`Disease aliases upserted: ${summary.syncedAliases}`);
      console.log(`Plant-disease relations upserted: ${summary.syncedMappings}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`db:sync failed: ${error.message}`);
  process.exit(1);
});
