/**
 * File: backend/scripts/sync-catalog.mjs
 * Purpose: Source module (sync-catalog.mjs) used by the Flora application.
 *
 * Responsibilities:
 * - Implements feature-specific logic used by the active runtime
 * - Maintains predictable behavior through explicit module boundaries
 *
 * Design Notes:
 * - Scoped to keep code discoverable and maintainable over time
 */

import fs from "fs/promises";
import path from "path";
import mysql from "mysql2/promise";

const ROOT_DIR = process.cwd();
const BACKEND_DIR = ROOT_DIR;
const ENV_PATH = path.join(BACKEND_DIR, ".env.local");
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

async function tableExists(connection, dbName, tableName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [dbName, tableName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function columnExists(connection, dbName, tableName, columnName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [dbName, tableName, columnName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function constraintExists(connection, dbName, tableName, constraintName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.table_constraints
     WHERE table_schema = ? AND table_name = ? AND constraint_name = ?`,
    [dbName, tableName, constraintName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function indexExists(connection, dbName, tableName, indexName) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ? AND index_name = ?`,
    [dbName, tableName, indexName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function ensureColumn(connection, dbName, tableName, columnName, alterSql) {
  if (!(await columnExists(connection, dbName, tableName, columnName))) {
    await connection.query(alterSql);
    console.log(`Added column: ${tableName}.${columnName}`);
  }
}

async function ensureIndex(connection, dbName, tableName, indexName, alterSql) {
  if (!(await indexExists(connection, dbName, tableName, indexName))) {
    try {
      await connection.query(alterSql);
      console.log(`Added index: ${indexName}`);
    } catch (error) {
      console.warn(`Skipped index ${indexName}: ${error.message}`);
    }
  }
}

async function ensureConstraint(connection, dbName, tableName, constraintName, alterSql) {
  if (!(await constraintExists(connection, dbName, tableName, constraintName))) {
    try {
      await connection.query(alterSql);
      console.log(`Added constraint: ${constraintName}`);
    } catch (error) {
      console.warn(`Skipped constraint ${constraintName}: ${error.message}`);
    }
  }
}

async function ensureSchema(connection, dbName) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS plant_aliases (
      alias_id INT PRIMARY KEY AUTO_INCREMENT,
      plant_id INT NOT NULL,
      alias_name VARCHAR(200) NOT NULL,
      alias_name_norm VARCHAR(200) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_plant_alias_name (alias_name),
      INDEX idx_plant_alias_plant (plant_id),
      INDEX idx_plant_alias_name_norm (alias_name_norm)
    )`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS plant_disease_map (
      mapping_id INT PRIMARY KEY AUTO_INCREMENT,
      plant_id INT NOT NULL,
      disease_id INT NOT NULL,
      relation_type ENUM('common', 'primary', 'possible') NOT NULL DEFAULT 'common',
      source ENUM('json', 'admin', 'inference') NOT NULL DEFAULT 'json',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_plant_disease_pair (plant_id, disease_id),
      INDEX idx_pdm_plant (plant_id),
      INDEX idx_pdm_disease (disease_id)
    )`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS disease_aliases (
      alias_id INT PRIMARY KEY AUTO_INCREMENT,
      disease_id INT NOT NULL,
      alias_name VARCHAR(200) NOT NULL,
      alias_name_norm VARCHAR(200) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_disease_alias_name (alias_name),
      INDEX idx_disease_alias_disease (disease_id),
      INDEX idx_disease_alias_name_norm (alias_name_norm)
    )`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS admin_audit_logs (
      audit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      actor_user_id INT NULL,
      actor_role ENUM('anonymous', 'user', 'admin') NOT NULL DEFAULT 'anonymous',
      action VARCHAR(120) NOT NULL,
      target_type VARCHAR(60) NOT NULL,
      target_id VARCHAR(120) NULL,
      status ENUM('success', 'failure') NOT NULL DEFAULT 'success',
      ip_address VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      metadata_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_created (created_at),
      INDEX idx_audit_actor_role_created (actor_role, created_at),
      INDEX idx_audit_action_created (action, created_at),
      INDEX idx_audit_target (target_type, target_id)
    )`
  );

  await connection.query(
    `CREATE TABLE IF NOT EXISTS api_request_telemetry (
      telemetry_id BIGINT PRIMARY KEY AUTO_INCREMENT,
      actor_user_id INT NULL,
      actor_role ENUM('anonymous', 'user', 'admin') NOT NULL DEFAULT 'anonymous',
      route_path VARCHAR(180) NOT NULL,
      method VARCHAR(10) NOT NULL,
      status_code SMALLINT NOT NULL,
      duration_ms INT NOT NULL,
      ip_address VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_telemetry_route_created (route_path, created_at),
      INDEX idx_telemetry_status_created (status_code, created_at),
      INDEX idx_telemetry_duration_created (duration_ms, created_at)
    )`
  );

  await ensureColumn(
    connection,
    dbName,
    "plants",
    "common_name_norm",
    "ALTER TABLE plants ADD COLUMN common_name_norm VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(common_name))) STORED"
  );
  await ensureColumn(
    connection,
    dbName,
    "plants",
    "scientific_name_norm",
    "ALTER TABLE plants ADD COLUMN scientific_name_norm VARCHAR(150) GENERATED ALWAYS AS (LOWER(TRIM(scientific_name))) STORED"
  );
  await ensureColumn(
    connection,
    dbName,
    "plants",
    "species_norm",
    "ALTER TABLE plants ADD COLUMN species_norm VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(species))) STORED"
  );

  await ensureColumn(connection, dbName, "plant_diseases", "json_file", "ALTER TABLE plant_diseases ADD COLUMN json_file VARCHAR(255) NULL");
  await ensureColumn(connection, dbName, "plant_diseases", "primary_plant_id", "ALTER TABLE plant_diseases ADD COLUMN primary_plant_id INT NULL");
  await ensureColumn(
    connection,
    dbName,
    "plant_diseases",
    "disease_name_norm",
    "ALTER TABLE plant_diseases ADD COLUMN disease_name_norm VARCHAR(150) GENERATED ALWAYS AS (LOWER(TRIM(disease_name))) STORED"
  );
  await ensureColumn(
    connection,
    dbName,
    "plant_diseases",
    "affected_species_norm",
    "ALTER TABLE plant_diseases ADD COLUMN affected_species_norm VARCHAR(255) GENERATED ALWAYS AS (LOWER(TRIM(COALESCE(affected_species, '')))) STORED"
  );
  await ensureColumn(
    connection,
    dbName,
    "plant_aliases",
    "alias_name_norm",
    "ALTER TABLE plant_aliases ADD COLUMN alias_name_norm VARCHAR(200) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED"
  );
  await ensureColumn(
    connection,
    dbName,
    "disease_aliases",
    "alias_name_norm",
    "ALTER TABLE disease_aliases ADD COLUMN alias_name_norm VARCHAR(200) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED"
  );

  await ensureColumn(connection, dbName, "scan_history", "plant_id", "ALTER TABLE scan_history ADD COLUMN plant_id INT NULL");
  await ensureColumn(connection, dbName, "scan_history", "disease_id", "ALTER TABLE scan_history ADD COLUMN disease_id INT NULL");

  await ensureIndex(connection, dbName, "plants", "idx_plants_common_name_norm", "ALTER TABLE plants ADD INDEX idx_plants_common_name_norm (common_name_norm)");
  await ensureIndex(connection, dbName, "plants", "idx_plants_scientific_name_norm", "ALTER TABLE plants ADD INDEX idx_plants_scientific_name_norm (scientific_name_norm)");
  await ensureIndex(connection, dbName, "plants", "idx_plants_species_norm", "ALTER TABLE plants ADD INDEX idx_plants_species_norm (species_norm)");
  await ensureIndex(connection, dbName, "plants", "ft_plants_search", "ALTER TABLE plants ADD FULLTEXT INDEX ft_plants_search (common_name, scientific_name, species)");
  await ensureIndex(connection, dbName, "plant_diseases", "idx_disease_name_norm", "ALTER TABLE plant_diseases ADD INDEX idx_disease_name_norm (disease_name_norm)");
  await ensureIndex(connection, dbName, "plant_diseases", "idx_disease_species_norm", "ALTER TABLE plant_diseases ADD INDEX idx_disease_species_norm (affected_species_norm)");
  await ensureIndex(connection, dbName, "plant_diseases", "ft_disease_search", "ALTER TABLE plant_diseases ADD FULLTEXT INDEX ft_disease_search (disease_name, affected_species, disease_description, symptoms, causes)");
  await ensureIndex(connection, dbName, "plant_aliases", "idx_plant_alias_name_norm", "ALTER TABLE plant_aliases ADD INDEX idx_plant_alias_name_norm (alias_name_norm)");
  await ensureIndex(connection, dbName, "disease_aliases", "idx_disease_alias_name_norm", "ALTER TABLE disease_aliases ADD INDEX idx_disease_alias_name_norm (alias_name_norm)");

  await ensureConstraint(
    connection,
    dbName,
    "plant_aliases",
    "fk_plant_alias_plant",
    "ALTER TABLE plant_aliases ADD CONSTRAINT fk_plant_alias_plant FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE"
  );

  await ensureConstraint(
    connection,
    dbName,
    "plant_diseases",
    "fk_disease_primary_plant",
    "ALTER TABLE plant_diseases ADD CONSTRAINT fk_disease_primary_plant FOREIGN KEY (primary_plant_id) REFERENCES plants(plant_id) ON DELETE SET NULL"
  );

  await ensureConstraint(
    connection,
    dbName,
    "plant_disease_map",
    "fk_pdm_plant",
    "ALTER TABLE plant_disease_map ADD CONSTRAINT fk_pdm_plant FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE"
  );

  await ensureConstraint(
    connection,
    dbName,
    "plant_disease_map",
    "fk_pdm_disease",
    "ALTER TABLE plant_disease_map ADD CONSTRAINT fk_pdm_disease FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE CASCADE"
  );

  await ensureConstraint(
    connection,
    dbName,
    "disease_aliases",
    "fk_disease_alias_disease",
    "ALTER TABLE disease_aliases ADD CONSTRAINT fk_disease_alias_disease FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE CASCADE"
  );

  await ensureConstraint(
    connection,
    dbName,
    "scan_history",
    "fk_scan_plant",
    "ALTER TABLE scan_history ADD CONSTRAINT fk_scan_plant FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE SET NULL"
  );

  await ensureConstraint(
    connection,
    dbName,
    "scan_history",
    "fk_scan_disease",
    "ALTER TABLE scan_history ADD CONSTRAINT fk_scan_disease FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE SET NULL"
  );

  await ensureConstraint(
    connection,
    dbName,
    "admin_audit_logs",
    "fk_audit_actor_user",
    "ALTER TABLE admin_audit_logs ADD CONSTRAINT fk_audit_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL"
  );

  await ensureConstraint(
    connection,
    dbName,
    "api_request_telemetry",
    "fk_telemetry_actor_user",
    "ALTER TABLE api_request_telemetry ADD CONSTRAINT fk_telemetry_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL"
  );
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
        `INSERT INTO plant_aliases (plant_id, alias_name)\n         SELECT ?, alias_name FROM plant_aliases WHERE plant_id = ?\n         ON DUPLICATE KEY UPDATE plant_id = VALUES(plant_id)`,
        [keeper.id, duplicate.id]
      );
      await connection.execute(`DELETE FROM plant_aliases WHERE plant_id = ?`, [duplicate.id]);

      await connection.execute(
        `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)\n         SELECT ?, disease_id, relation_type, source FROM plant_disease_map WHERE plant_id = ?\n         ON DUPLICATE KEY UPDATE relation_type = VALUES(relation_type), source = VALUES(source)`,
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
        `INSERT INTO disease_aliases (disease_id, alias_name)\n         SELECT ?, alias_name FROM disease_aliases WHERE disease_id = ?\n         ON DUPLICATE KEY UPDATE disease_id = VALUES(disease_id)`,
        [keeper.id, duplicate.id]
      );
      await connection.execute(`DELETE FROM disease_aliases WHERE disease_id = ?`, [duplicate.id]);

      await connection.execute(
        `INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)\n         SELECT plant_id, ?, relation_type, source FROM plant_disease_map WHERE disease_id = ?\n         ON DUPLICATE KEY UPDATE relation_type = VALUES(relation_type), source = VALUES(source)`,
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

  // Provide compact variants for tags that remove spaces/punctuation.
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

  const [plantRowsRaw] = await connection.execute(
    `SELECT plant_id, common_name, scientific_name, species
     FROM plants`
  );
  const plantRows = plantRowsRaw;
  const plantLookup = buildPlantLookup(plantRows);

  for (const plantRow of plantRows) {
    const aliases = buildPlantAliases(plantRow.common_name, plantRow.scientific_name, plantRow.species);
    for (const alias of aliases) {
      await connection.execute(
        `INSERT INTO plant_aliases (plant_id, alias_name)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE plant_id = VALUES(plant_id)`,
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

    const [diseaseRowsRaw] = await connection.execute(
      `SELECT disease_id
       FROM plant_diseases
       WHERE LOWER(disease_name) = LOWER(?)
       LIMIT 1`,
      [diseaseName]
    );

    const diseaseRow = diseaseRowsRaw[0];
    if (!diseaseRow?.disease_id) {
      continue;
    }

    const aliases = buildDiseaseAliases(diseaseName, affectedSpecies);
    for (const alias of aliases) {
      await connection.execute(
        `INSERT INTO disease_aliases (disease_id, alias_name)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE disease_id = VALUES(disease_id)`,
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
         ON DUPLICATE KEY UPDATE
           relation_type = VALUES(relation_type),
           source = VALUES(source)`,
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
         ON DUPLICATE KEY UPDATE
           relation_type = VALUES(relation_type),
           source = VALUES(source)`,
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
  const env = {
    DB_HOST: process.env.DB_HOST || localEnv.DB_HOST || "127.0.0.1",
    DB_USER: process.env.DB_USER || localEnv.DB_USER || "root",
    DB_PASSWORD: process.env.DB_PASSWORD || localEnv.DB_PASSWORD || "",
    DB_NAME: process.env.DB_NAME || localEnv.DB_NAME || "flora"
  };

  const bootstrap = await mysql.createConnection({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD
  });

  await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${env.DB_NAME}\``);
  await bootstrap.end();

  const connection = await mysql.createConnection({
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    multipleStatements: false
  });

  try {
    const requiredTables = ["users", "plants", "plant_diseases", "scan_history"];
    for (const tableName of requiredTables) {
      if (!(await tableExists(connection, env.DB_NAME, tableName))) {
        throw new Error(
          `Missing required table '${tableName}'. Run backend/database/schema.sql first, then run npm run db:sync.`
        );
      }
    }

    await connection.beginTransaction();
    await ensureSchema(connection, env.DB_NAME);
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
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`db:sync failed: ${error.message}`);
  process.exit(1);
});
