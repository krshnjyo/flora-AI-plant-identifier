/**
 * File: backend/tests/identify-decision.test.ts
 * Purpose: Unit tests for identify output decision routing rules.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { resolveIdentifyDecision } from "../lib/identify-decision.ts";

test("smart mode prefers plant when both plant and disease are available", () => {
  const result = resolveIdentifyDecision({
    outputMode: "smart",
    identifiedName: "Tomato",
    diseaseGuess: "Late blight",
    plantMatch: {
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum"
    },
    diseaseMatch: {
      disease_name: "Late blight",
      primary_plant_name: "Tomato",
      linked_plant_names: []
    }
  });

  assert.equal(result.entityType, "plant");
  assert.equal(result.canonicalName, "Tomato");
  assert.equal(result.resolvedDiseaseName, "Late blight");
});

test("disease mode returns disease when disease exists", () => {
  const result = resolveIdentifyDecision({
    outputMode: "disease",
    identifiedName: "Tomato",
    diseaseGuess: "Early blight",
    plantMatch: {
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum"
    },
    diseaseMatch: null
  });

  assert.equal(result.entityType, "disease");
  assert.equal(result.canonicalName, "Early blight");
});

test("plant mode still resolves a plant when disease metadata provides one", () => {
  const result = resolveIdentifyDecision({
    outputMode: "plant",
    identifiedName: "",
    diseaseGuess: "Powdery mildew",
    plantMatch: null,
    diseaseMatch: {
      disease_name: "Powdery mildew",
      primary_plant_name: "Rose",
      linked_plant_names: ["Rose"]
    }
  });

  assert.equal(result.entityType, "plant");
  assert.equal(result.canonicalPlantName, "Rose");
  assert.equal(result.canonicalName, "Rose");
});

test("returns not_found when no canonical plant or disease is available", () => {
  const result = resolveIdentifyDecision({
    outputMode: "smart",
    identifiedName: "",
    diseaseGuess: "",
    plantMatch: null,
    diseaseMatch: null
  });

  assert.equal(result.entityType, "not_found");
  assert.equal(result.canonicalName, "");
  assert.equal(result.canonicalPlantName, null);
  assert.equal(result.resolvedDiseaseName, null);
});

test("smart mode keeps model plant label over disease-linked fallback plant", () => {
  const result = resolveIdentifyDecision({
    outputMode: "smart",
    identifiedName: "Potato",
    diseaseGuess: "Late blight",
    plantMatch: null,
    diseaseMatch: {
      disease_name: "Late blight",
      primary_plant_name: "Tomato",
      linked_plant_names: ["Tomato"]
    }
  });

  assert.equal(result.entityType, "plant");
  assert.equal(result.canonicalPlantName, "Potato");
  assert.equal(result.canonicalName, "Potato");
  assert.equal(result.resolvedDiseaseName, "Late blight");
});

test("plant mode does not fall back to disease-only output when fallback is disabled", () => {
  const result = resolveIdentifyDecision({
    outputMode: "plant",
    identifiedName: "",
    diseaseGuess: "Powdery mildew",
    plantMatch: null,
    diseaseMatch: {
      disease_name: "Powdery mildew",
      primary_plant_name: "Rose",
      linked_plant_names: ["Rose"]
    },
    allowModelFallback: false
  });

  assert.equal(result.entityType, "not_found");
  assert.equal(result.canonicalPlantName, "Rose");
  assert.equal(result.resolvedDiseaseName, "Powdery mildew");
});

test("disease mode does not fall back to plant-only output when fallback is disabled", () => {
  const result = resolveIdentifyDecision({
    outputMode: "disease",
    identifiedName: "Tomato",
    diseaseGuess: "",
    plantMatch: {
      common_name: "Tomato",
      scientific_name: "Solanum lycopersicum"
    },
    diseaseMatch: null,
    allowModelFallback: false
  });

  assert.equal(result.entityType, "not_found");
  assert.equal(result.canonicalPlantName, "Tomato");
  assert.equal(result.resolvedDiseaseName, null);
});
