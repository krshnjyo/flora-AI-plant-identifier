/**
 * File: backend/tests/admin-crud-validation.test.ts
 * Purpose: Unit tests for admin CRUD request schema validation.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { diseaseAdminSchema, plantAdminSchema, userUpdateSchema } from "../lib/validators.ts";

test("plant admin schema accepts valid create payload", () => {
  const parsed = plantAdminSchema.safeParse({
    commonName: "Tomato",
    scientificName: "Solanum lycopersicum",
    species: "S. lycopersicum",
    confidenceScore: 98.5,
    jsonFile: "data/plants/tomato.json"
  });

  assert.equal(parsed.success, true);
});

test("plant admin schema rejects out-of-range confidence", () => {
  const parsed = plantAdminSchema.safeParse({
    commonName: "Tomato",
    scientificName: "Solanum lycopersicum",
    species: "S. lycopersicum",
    confidenceScore: 101,
    jsonFile: "data/plants/tomato.json"
  });

  assert.equal(parsed.success, false);
});

test("disease admin schema validates required CRUD fields", () => {
  const parsed = diseaseAdminSchema.safeParse({
    diseaseName: "Late blight",
    affectedSpecies: "Tomato",
    diseaseDescription: "Aggressive fungal-like disease affecting leaves and stems.",
    symptoms: "Dark lesions on leaves and stems",
    causes: "Pathogen pressure and humid conditions",
    preventionMethods: "Improve airflow and avoid overhead irrigation",
    treatmentMethods: "Use approved fungicide rotation",
    severityLevel: "High"
  });

  assert.equal(parsed.success, true);
});

test("user update schema requires positive user id", () => {
  const parsed = userUpdateSchema.safeParse({
    userId: 0,
    role: "admin"
  });

  assert.equal(parsed.success, false);
});
