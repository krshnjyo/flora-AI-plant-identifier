-- ============================================================================
-- File: backend/database/schema.sql
-- Purpose: Defines the full MySQL schema and stored procedures for Flora.
--
-- Responsibilities:
-- - Creates core tables used by auth, catalog, relations, and scan history.
-- - Adds indexes and foreign keys for query performance and referential integrity.
-- - Defines admin procedures used by backend API routes for CRUD operations.
--
-- Notes:
-- - Safe to re-run: table/procedure creation uses IF EXISTS / IF NOT EXISTS patterns.
-- - Keep this file in sync with backend/scripts/sync-catalog.mjs expectations.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS flora;
USE flora;

-- ============================================================================
-- Core Auth/User Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  user_id INT PRIMARY KEY AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  account_status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role_status_created (role, account_status, created_at)
);

-- ============================================================================
-- User Profile and Settings (1:1 with users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id INT PRIMARY KEY,
  bio TEXT NULL,
  avatar_url VARCHAR(255) NULL,
  default_output ENUM('smart', 'species', 'disease') NOT NULL DEFAULT 'smart',
  scan_notifications TINYINT(1) NOT NULL DEFAULT 1,
  email_notifications TINYINT(1) NOT NULL DEFAULT 1,
  login_alerts TINYINT(1) NOT NULL DEFAULT 1,
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  allow_model_fallback TINYINT(1) NOT NULL DEFAULT 1,
  audit_retention_days INT NOT NULL DEFAULT 90,
  incident_alerts TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_user_profiles_audit_retention CHECK (audit_retention_days IN (30, 90, 365)),
  INDEX idx_user_profiles_default_output (default_output),
  INDEX idx_user_profiles_updated_at (updated_at)
);

-- ============================================================================
-- Plant Catalog Table (linked to plant JSON files)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plants (
  plant_id INT PRIMARY KEY AUTO_INCREMENT,
  common_name VARCHAR(100) NOT NULL,
  scientific_name VARCHAR(150) NOT NULL,
  species VARCHAR(100) NOT NULL,
  confidence_score DECIMAL(5,2) NOT NULL,
  json_file VARCHAR(255) NOT NULL,
  common_name_norm VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(common_name))) STORED,
  scientific_name_norm VARCHAR(150) GENERATED ALWAYS AS (LOWER(TRIM(scientific_name))) STORED,
  species_norm VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(species))) STORED,
  UNIQUE KEY uq_plants_scientific_name (scientific_name),
  INDEX idx_plants_common_name (common_name),
  INDEX idx_plants_species (species),
  INDEX idx_plants_common_name_norm (common_name_norm),
  INDEX idx_plants_scientific_name_norm (scientific_name_norm),
  INDEX idx_plants_species_norm (species_norm),
  FULLTEXT KEY ft_plants_search (common_name, scientific_name, species)
);

-- ============================================================================
-- Plant Alias Table (for model output synonyms)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_aliases (
  alias_id INT PRIMARY KEY AUTO_INCREMENT,
  plant_id INT NOT NULL,
  alias_name VARCHAR(200) NOT NULL,
  alias_name_norm VARCHAR(200) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plant_alias_name (alias_name),
  INDEX idx_plant_alias_plant (plant_id),
  INDEX idx_plant_alias_name_norm (alias_name_norm),
  CONSTRAINT fk_plant_alias_plant FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);

-- ============================================================================
-- Disease Catalog Table (linked to disease JSON files)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_diseases (
  disease_id INT PRIMARY KEY AUTO_INCREMENT,
  disease_name VARCHAR(150) NOT NULL,
  affected_species VARCHAR(255),
  disease_description TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  causes TEXT NOT NULL,
  prevention_methods TEXT NOT NULL,
  treatment_methods TEXT NOT NULL,
  severity_level VARCHAR(50) NOT NULL,
  json_file VARCHAR(255) NULL,
  primary_plant_id INT NULL,
  disease_name_norm VARCHAR(150) GENERATED ALWAYS AS (LOWER(TRIM(disease_name))) STORED,
  affected_species_norm VARCHAR(255) GENERATED ALWAYS AS (LOWER(TRIM(COALESCE(affected_species, '')))) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_disease_name (disease_name),
  INDEX idx_disease_severity (severity_level),
  INDEX idx_disease_primary_plant (primary_plant_id),
  INDEX idx_disease_name_norm (disease_name_norm),
  INDEX idx_disease_species_norm (affected_species_norm),
  FULLTEXT KEY ft_disease_search (disease_name, affected_species, disease_description, symptoms, causes),
  CONSTRAINT fk_disease_primary_plant FOREIGN KEY (primary_plant_id) REFERENCES plants(plant_id) ON DELETE SET NULL
);

-- ============================================================================
-- Plant ↔ Disease Mapping Table (many-to-many relationship)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_disease_map (
  mapping_id INT PRIMARY KEY AUTO_INCREMENT,
  plant_id INT NOT NULL,
  disease_id INT NOT NULL,
  relation_type ENUM('common', 'primary', 'possible') NOT NULL DEFAULT 'common',
  source ENUM('json', 'admin', 'inference') NOT NULL DEFAULT 'json',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plant_disease_pair (plant_id, disease_id),
  INDEX idx_pdm_plant (plant_id),
  INDEX idx_pdm_disease (disease_id),
  CONSTRAINT fk_pdm_plant FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE,
  CONSTRAINT fk_pdm_disease FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE CASCADE
);

-- ============================================================================
-- Disease Alias Table (for model output synonyms)
-- ============================================================================
CREATE TABLE IF NOT EXISTS disease_aliases (
  alias_id INT PRIMARY KEY AUTO_INCREMENT,
  disease_id INT NOT NULL,
  alias_name VARCHAR(200) NOT NULL,
  alias_name_norm VARCHAR(200) GENERATED ALWAYS AS (LOWER(TRIM(alias_name))) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_disease_alias_name (alias_name),
  INDEX idx_disease_alias_disease (disease_id),
  INDEX idx_disease_alias_name_norm (alias_name_norm),
  CONSTRAINT fk_disease_alias_disease FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE CASCADE
);

-- ============================================================================
-- Scan History (stores names + optional FK links)
-- ============================================================================
CREATE TABLE IF NOT EXISTS scan_history (
  scan_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  plant_id INT NULL,
  disease_id INT NULL,
  plant_name VARCHAR(150),
  disease_name VARCHAR(150),
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_scan_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_scan_plant FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE SET NULL,
  CONSTRAINT fk_scan_disease FOREIGN KEY (disease_id) REFERENCES plant_diseases(disease_id) ON DELETE SET NULL,
  INDEX idx_scan_user_created (user_id, created_at),
  INDEX idx_scan_created (created_at),
  INDEX idx_scan_disease_name (disease_name),
  INDEX idx_scan_plant_id (plant_id),
  INDEX idx_scan_disease_id (disease_id)
);

-- ============================================================================
-- Admin Audit Logs (role-aware mutation trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_audit_logs (
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
  CONSTRAINT fk_audit_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_actor_role_created (actor_role, created_at),
  INDEX idx_audit_action_created (action, created_at),
  INDEX idx_audit_target (target_type, target_id)
);

-- ============================================================================
-- Request Telemetry (admin and identify endpoint performance trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS api_request_telemetry (
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
  CONSTRAINT fk_telemetry_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
  INDEX idx_telemetry_route_created (route_path, created_at),
  INDEX idx_telemetry_status_created (status_code, created_at),
  INDEX idx_telemetry_duration_created (duration_ms, created_at)
);

DELIMITER $$

-- ============================================================================
-- Plant Procedures
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_upsert_plant $$
CREATE PROCEDURE sp_upsert_plant(
  IN p_plant_id INT,
  IN p_common_name VARCHAR(100),
  IN p_scientific_name VARCHAR(150),
  IN p_species VARCHAR(100),
  IN p_confidence_score DECIMAL(5,2),
  IN p_json_file VARCHAR(255)
)
BEGIN
  IF p_plant_id IS NULL OR p_plant_id <= 0 THEN
    INSERT INTO plants (common_name, scientific_name, species, confidence_score, json_file)
    VALUES (p_common_name, p_scientific_name, p_species, p_confidence_score, p_json_file)
    ON DUPLICATE KEY UPDATE
      common_name = VALUES(common_name),
      species = VALUES(species),
      confidence_score = VALUES(confidence_score),
      json_file = VALUES(json_file);
  ELSE
    UPDATE plants
    SET common_name = p_common_name,
        scientific_name = p_scientific_name,
        species = p_species,
        confidence_score = p_confidence_score,
        json_file = p_json_file
    WHERE plant_id = p_plant_id;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_delete_plant $$
CREATE PROCEDURE sp_delete_plant(IN p_plant_id INT)
BEGIN
  DELETE FROM plants WHERE plant_id = p_plant_id;
END $$

-- ============================================================================
-- Disease Procedures
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_upsert_disease $$
CREATE PROCEDURE sp_upsert_disease(
  IN p_disease_id INT,
  IN p_disease_name VARCHAR(150),
  IN p_affected_species VARCHAR(255),
  IN p_disease_description TEXT,
  IN p_symptoms TEXT,
  IN p_causes TEXT,
  IN p_prevention_methods TEXT,
  IN p_treatment_methods TEXT,
  IN p_severity_level VARCHAR(50),
  IN p_json_file VARCHAR(255),
  IN p_primary_plant_id INT
)
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
    ON DUPLICATE KEY UPDATE
      affected_species = VALUES(affected_species),
      disease_description = VALUES(disease_description),
      symptoms = VALUES(symptoms),
      causes = VALUES(causes),
      prevention_methods = VALUES(prevention_methods),
      treatment_methods = VALUES(treatment_methods),
      severity_level = VALUES(severity_level),
      json_file = VALUES(json_file),
      primary_plant_id = VALUES(primary_plant_id);
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
END $$

DROP PROCEDURE IF EXISTS sp_delete_disease $$
CREATE PROCEDURE sp_delete_disease(IN p_disease_id INT)
BEGIN
  DELETE FROM plant_diseases WHERE disease_id = p_disease_id;
END $$

DROP PROCEDURE IF EXISTS sp_link_plant_disease $$
CREATE PROCEDURE sp_link_plant_disease(
  IN p_plant_id INT,
  IN p_disease_id INT,
  IN p_relation_type VARCHAR(20),
  IN p_source VARCHAR(20)
)
BEGIN
  INSERT INTO plant_disease_map (plant_id, disease_id, relation_type, source)
  VALUES (p_plant_id, p_disease_id, p_relation_type, p_source)
  ON DUPLICATE KEY UPDATE
    relation_type = VALUES(relation_type),
    source = VALUES(source);
END $$

DROP PROCEDURE IF EXISTS sp_unlink_plant_disease $$
CREATE PROCEDURE sp_unlink_plant_disease(
  IN p_plant_id INT,
  IN p_disease_id INT
)
BEGIN
  DELETE FROM plant_disease_map WHERE plant_id = p_plant_id AND disease_id = p_disease_id;
END $$

-- ============================================================================
-- User Procedures
-- ============================================================================
DROP PROCEDURE IF EXISTS sp_update_user_role_status $$
CREATE PROCEDURE sp_update_user_role_status(
  IN p_user_id INT,
  IN p_role VARCHAR(50),
  IN p_account_status VARCHAR(50)
)
BEGIN
  UPDATE users
  SET role = COALESCE(p_role, role),
      account_status = COALESCE(p_account_status, account_status)
  WHERE user_id = p_user_id;
END $$

DROP PROCEDURE IF EXISTS sp_delete_user $$
CREATE PROCEDURE sp_delete_user(IN p_user_id INT)
BEGIN
  DELETE FROM users WHERE user_id = p_user_id;
END $$

DELIMITER ;
