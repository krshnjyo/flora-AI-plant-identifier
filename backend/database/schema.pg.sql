-- ============================================================================
-- File: backend/database/schema.pg.sql
-- Purpose: PostgreSQL/Neon schema and function definitions for Flora.
--
-- Responsibilities:
-- - Creates the PostgreSQL equivalents of the core Flora tables.
-- - Replaces MySQL enums, booleans, fulltext indexes, and auto-increment keys.
-- - Converts MySQL stored procedures into PostgreSQL functions.
--
-- Notes:
-- - Safe to re-run: uses IF EXISTS / IF NOT EXISTS where PostgreSQL supports it.
-- - Designed for PostgreSQL 14+ and Neon-hosted deployments.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Core Auth/User Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  user_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name varchar(100) NOT NULL,
  email varchar(150) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role_status_created
  ON users (role, account_status, created_at);

-- ============================================================================
-- User Profile and Settings (1:1 with users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id integer PRIMARY KEY,
  bio text,
  avatar_url varchar(255),
  default_output text NOT NULL DEFAULT 'smart' CHECK (default_output IN ('smart', 'species', 'disease')),
  scan_notifications boolean NOT NULL DEFAULT true,
  email_notifications boolean NOT NULL DEFAULT true,
  login_alerts boolean NOT NULL DEFAULT true,
  two_factor_enabled boolean NOT NULL DEFAULT false,
  allow_model_fallback boolean NOT NULL DEFAULT true,
  audit_retention_days integer NOT NULL DEFAULT 90 CHECK (audit_retention_days IN (30, 90, 365)),
  incident_alerts boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profiles_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_default_output
  ON user_profiles (default_output);
CREATE INDEX IF NOT EXISTS idx_user_profiles_updated_at
  ON user_profiles (updated_at);

-- ============================================================================
-- Plant Catalog Table (linked to plant JSON files)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plants (
  plant_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  common_name varchar(100) NOT NULL,
  scientific_name varchar(150) NOT NULL,
  species varchar(100) NOT NULL,
  confidence_score numeric(5, 2) NOT NULL,
  json_file varchar(255) NOT NULL,
  common_name_norm varchar(100) GENERATED ALWAYS AS (lower(btrim(common_name))) STORED,
  scientific_name_norm varchar(150) GENERATED ALWAYS AS (lower(btrim(scientific_name))) STORED,
  species_norm varchar(100) GENERATED ALWAYS AS (lower(btrim(species))) STORED,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(common_name, '') || ' ' || coalesce(scientific_name, '') || ' ' || coalesce(species, '')
    )
  ) STORED,
  CONSTRAINT uq_plants_scientific_name UNIQUE (scientific_name)
);

CREATE INDEX IF NOT EXISTS idx_plants_common_name
  ON plants (common_name);
CREATE INDEX IF NOT EXISTS idx_plants_species
  ON plants (species);
CREATE INDEX IF NOT EXISTS idx_plants_common_name_norm
  ON plants (common_name_norm);
CREATE INDEX IF NOT EXISTS idx_plants_scientific_name_norm
  ON plants (scientific_name_norm);
CREATE INDEX IF NOT EXISTS idx_plants_species_norm
  ON plants (species_norm);
CREATE INDEX IF NOT EXISTS idx_plants_search_vector
  ON plants USING gin (search_vector);

-- ============================================================================
-- Plant Alias Table (for model output synonyms)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_aliases (
  alias_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plant_id integer NOT NULL,
  alias_name varchar(200) NOT NULL,
  alias_name_norm varchar(200) GENERATED ALWAYS AS (lower(btrim(alias_name))) STORED,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_plant_alias_name UNIQUE (alias_name),
  CONSTRAINT fk_plant_alias_plant
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plant_alias_plant
  ON plant_aliases (plant_id);
CREATE INDEX IF NOT EXISTS idx_plant_alias_name_norm
  ON plant_aliases (alias_name_norm);

-- ============================================================================
-- Disease Catalog Table (linked to disease JSON files)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_diseases (
  disease_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disease_name varchar(150) NOT NULL,
  affected_species varchar(255),
  disease_description text NOT NULL,
  symptoms text NOT NULL,
  causes text NOT NULL,
  prevention_methods text NOT NULL,
  treatment_methods text NOT NULL,
  severity_level varchar(50) NOT NULL,
  json_file varchar(255),
  primary_plant_id integer,
  disease_name_norm varchar(150) GENERATED ALWAYS AS (lower(btrim(disease_name))) STORED,
  affected_species_norm varchar(255) GENERATED ALWAYS AS (lower(btrim(coalesce(affected_species, '')))) STORED,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(disease_name, '') || ' ' ||
      coalesce(affected_species, '') || ' ' ||
      coalesce(disease_description, '') || ' ' ||
      coalesce(symptoms, '') || ' ' ||
      coalesce(causes, '')
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_disease_name UNIQUE (disease_name),
  CONSTRAINT fk_disease_primary_plant
    FOREIGN KEY (primary_plant_id) REFERENCES plants(plant_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_disease_severity
  ON plant_diseases (severity_level);
CREATE INDEX IF NOT EXISTS idx_disease_primary_plant
  ON plant_diseases (primary_plant_id);
CREATE INDEX IF NOT EXISTS idx_disease_name_norm
  ON plant_diseases (disease_name_norm);
CREATE INDEX IF NOT EXISTS idx_disease_species_norm
  ON plant_diseases (affected_species_norm);
CREATE INDEX IF NOT EXISTS idx_disease_search_vector
  ON plant_diseases USING gin (search_vector);

-- ============================================================================
-- Plant ↔ Disease Mapping Table (many-to-many relationship)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_disease_map (
  mapping_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plant_id integer NOT NULL,
  disease_id integer NOT NULL,
  relation_type text NOT NULL DEFAULT 'common' CHECK (relation_type IN ('common', 'primary', 'possible')),
  source text NOT NULL DEFAULT 'json' CHECK (source IN ('json', 'admin', 'inference')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_plant_disease_pair UNIQUE (plant_id, disease_id),
  CONSTRAINT fk_pdm_plant
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE,
  CONSTRAINT fk_pdm_disease
    FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pdm_plant
  ON plant_disease_map (plant_id);
CREATE INDEX IF NOT EXISTS idx_pdm_disease
  ON plant_disease_map (disease_id);

-- ============================================================================
-- Disease Alias Table (for model output synonyms)
-- ============================================================================
CREATE TABLE IF NOT EXISTS disease_aliases (
  alias_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  disease_id integer NOT NULL,
  alias_name varchar(200) NOT NULL,
  alias_name_norm varchar(200) GENERATED ALWAYS AS (lower(btrim(alias_name))) STORED,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_disease_alias_name UNIQUE (alias_name),
  CONSTRAINT fk_disease_alias_disease
    FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_disease_alias_disease
  ON disease_aliases (disease_id);
CREATE INDEX IF NOT EXISTS idx_disease_alias_name_norm
  ON disease_aliases (alias_name_norm);

-- ============================================================================
-- Scan History (stores names + optional FK links)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scan_history (
  scan_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id integer,
  plant_id integer,
  disease_id integer,
  plant_name varchar(150),
  disease_name varchar(150),
  image_url varchar(255),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_scan_user
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_scan_plant
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE SET NULL,
  CONSTRAINT fk_scan_disease
    FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_user_created
  ON scan_history (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scan_created
  ON scan_history (created_at);
CREATE INDEX IF NOT EXISTS idx_scan_disease_name
  ON scan_history (disease_name);
CREATE INDEX IF NOT EXISTS idx_scan_plant_id
  ON scan_history (plant_id);
CREATE INDEX IF NOT EXISTS idx_scan_disease_id
  ON scan_history (disease_id);

-- ============================================================================
-- Admin Audit Logs (role-aware mutation trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id integer,
  actor_role text NOT NULL DEFAULT 'anonymous' CHECK (actor_role IN ('anonymous', 'user', 'admin')),
  action varchar(120) NOT NULL,
  target_type varchar(60) NOT NULL,
  target_id varchar(120),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure')),
  ip_address varchar(80),
  user_agent varchar(255),
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor_user
    FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created
  ON admin_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor_role_created
  ON admin_audit_logs (actor_role, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action_created
  ON admin_audit_logs (action, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target
  ON admin_audit_logs (target_type, target_id);

-- ============================================================================
-- Request Telemetry (admin and identify endpoint performance trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_request_telemetry (
  telemetry_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id integer,
  actor_role text NOT NULL DEFAULT 'anonymous' CHECK (actor_role IN ('anonymous', 'user', 'admin')),
  route_path varchar(180) NOT NULL,
  method varchar(10) NOT NULL,
  status_code smallint NOT NULL,
  duration_ms integer NOT NULL,
  ip_address varchar(80),
  user_agent varchar(255),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_telemetry_actor_user
    FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_telemetry_route_created
  ON api_request_telemetry (route_path, created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_status_created
  ON api_request_telemetry (status_code, created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_duration_created
  ON api_request_telemetry (duration_ms, created_at);

-- ============================================================================
-- Updated-at Trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_set_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_set_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- ============================================================================
-- Plant Functions
-- ============================================================================
DROP FUNCTION IF EXISTS sp_upsert_plant(integer, text, text, text, numeric, text);
CREATE OR REPLACE FUNCTION sp_upsert_plant(
  p_plant_id integer,
  p_common_name text,
  p_scientific_name text,
  p_species text,
  p_confidence_score numeric,
  p_json_file text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_plant_id IS NULL OR p_plant_id <= 0 THEN
    INSERT INTO plants (common_name, scientific_name, species, confidence_score, json_file)
    VALUES (p_common_name, p_scientific_name, p_species, p_confidence_score, p_json_file)
    ON CONFLICT (scientific_name) DO UPDATE
      SET common_name = EXCLUDED.common_name,
          species = EXCLUDED.species,
          confidence_score = EXCLUDED.confidence_score,
          json_file = EXCLUDED.json_file;
  ELSE
    UPDATE plants
    SET common_name = p_common_name,
        scientific_name = p_scientific_name,
        species = p_species,
        confidence_score = p_confidence_score,
        json_file = p_json_file
    WHERE plant_id = p_plant_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS sp_delete_plant(integer);
CREATE OR REPLACE FUNCTION sp_delete_plant(p_plant_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM plants WHERE plant_id = p_plant_id;
END;
$$;

-- ============================================================================
-- Disease Functions
-- ============================================================================
DROP FUNCTION IF EXISTS sp_upsert_disease(integer, text, text, text, text, text, text, text, text, text, integer);
CREATE OR REPLACE FUNCTION sp_upsert_disease(
  p_disease_id integer,
  p_disease_name text,
  p_affected_species text,
  p_disease_description text,
  p_symptoms text,
  p_causes text,
  p_prevention_methods text,
  p_treatment_methods text,
  p_severity_level text,
  p_json_file text,
  p_primary_plant_id integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_disease_id IS NULL OR p_disease_id <= 0 THEN
    INSERT INTO plant_diseases (
      disease_name,
      affected_species,
      disease_description,
      symptoms,
      causes,
      prevention_methods,
      treatment_methods,
      severity_level,
      json_file,
      primary_plant_id
    )
    VALUES (
      p_disease_name,
      p_affected_species,
      p_disease_description,
      p_symptoms,
      p_causes,
      p_prevention_methods,
      p_treatment_methods,
      p_severity_level,
      p_json_file,
      p_primary_plant_id
    )
    ON CONFLICT (disease_name) DO UPDATE
      SET affected_species = EXCLUDED.affected_species,
          disease_description = EXCLUDED.disease_description,
          symptoms = EXCLUDED.symptoms,
          causes = EXCLUDED.causes,
          prevention_methods = EXCLUDED.prevention_methods,
          treatment_methods = EXCLUDED.treatment_methods,
          severity_level = EXCLUDED.severity_level,
          json_file = EXCLUDED.json_file,
          primary_plant_id = EXCLUDED.primary_plant_id;
  ELSE
    UPDATE plant_diseases
    SET disease_name = p_disease_name,
        affected_species = p_affected_species,
        disease_description = p_disease_description,
        symptoms = p_symptoms,
        causes = p_causes,
        prevention_methods = p_prevention_methods,
        treatment_methods = p_treatment_methods,
        severity_level = p_severity_level,
        json_file = p_json_file,
        primary_plant_id = p_primary_plant_id
    WHERE disease_id = p_disease_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS sp_delete_disease(integer);
CREATE OR REPLACE FUNCTION sp_delete_disease(p_disease_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM plant_diseases WHERE disease_id = p_disease_id;
END;
$$;

DROP FUNCTION IF EXISTS sp_link_plant_disease(integer, integer, text, text);
CREATE OR REPLACE FUNCTION sp_link_plant_disease(
  p_plant_id integer,
  p_disease_id integer,
  p_relation_type text,
  p_source text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
  VALUES (p_plant_id, p_disease_id, p_relation_type, p_source)
  ON CONFLICT (plant_id, disease_id) DO UPDATE
    SET relation_type = EXCLUDED.relation_type,
        source = EXCLUDED.source;
END;
$$;

DROP FUNCTION IF EXISTS sp_unlink_plant_disease(integer, integer);
CREATE OR REPLACE FUNCTION sp_unlink_plant_disease(
  p_plant_id integer,
  p_disease_id integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM plant_disease_map
  WHERE plant_id = p_plant_id AND disease_id = p_disease_id;
END;
$$;

-- ============================================================================
-- User Functions
-- ============================================================================
DROP FUNCTION IF EXISTS sp_update_user_role_status(integer, text, text);
CREATE OR REPLACE FUNCTION sp_update_user_role_status(
  p_user_id integer,
  p_role text,
  p_account_status text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE users
  SET role = COALESCE(p_role, role),
      account_status = COALESCE(p_account_status, account_status)
  WHERE user_id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS sp_delete_user(integer);
CREATE OR REPLACE FUNCTION sp_delete_user(p_user_id integer)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM users WHERE user_id = p_user_id;
END;
$$;

COMMIT;
