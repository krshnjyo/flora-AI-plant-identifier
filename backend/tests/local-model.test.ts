/**
 * File: backend/tests/local-model.test.ts
 * Purpose: Unit tests for local model payload decoding compatibility.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeLocalModelPayload,
  isLowConfidencePrediction,
  LOCAL_MODEL_MIN_CONFIDENCE,
  shouldRetryCatalogPrediction
} from "../lib/local-model.ts";

test("decodes disease from class label when payload is class-only", () => {
  const result = decodeLocalModelPayload({
    class: "Potato___Late_blight",
    confidence: 0.93
  });

  assert.equal(result.plantName, "Potato");
  assert.equal(result.diseaseName, "Late Blight");
  assert.equal(result.isHealthy, false);
  assert.equal(result.confidence, 0.93);
});

test("prefers explicit plant and disease fields when present", () => {
  const result = decodeLocalModelPayload({
    class: "Tomato",
    plant_name: "Tomato",
    disease_name: "Early Blight",
    score: "0.88"
  });

  assert.equal(result.predictedClass, "Tomato");
  assert.equal(result.plantName, "Tomato");
  assert.equal(result.diseaseName, "Early Blight");
  assert.equal(result.isHealthy, false);
  assert.equal(result.confidence, 0.88);
});

test("supports payloads without class when explicit fields exist", () => {
  const result = decodeLocalModelPayload({
    plant: "Pepper",
    disease: "Bacterial Spot",
    probability: 0.7
  });

  assert.equal(result.predictedClass, "Pepper___Bacterial_Spot");
  assert.equal(result.plantName, "Pepper");
  assert.equal(result.diseaseName, "Bacterial Spot");
  assert.equal(result.isHealthy, false);
  assert.equal(result.confidence, 0.7);
});

test("throws when payload has no class or explicit names", () => {
  assert.throws(() => decodeLocalModelPayload({ confidence: 0.2 }), /missing class label/i);
});

test("honors retry hint fields from model service", () => {
  const result = decodeLocalModelPayload({
    class: "PlantVillage",
    confidence: 0,
    needs_retry: true,
    retry_message: "Try again with a leaf image",
    leaf_likelihood: 0.01
  });

  assert.equal(result.retrySuggested, true);
  assert.equal(result.retryMessage, "Try again with a leaf image");
  assert.equal(result.leafLikelihood, 0.01);
});

test("uses plant_scores and predicted_disease when provided by model service", () => {
  const result = decodeLocalModelPayload({
    class: "Tomato_Late_blight",
    confidence: 0.54,
    predicted_plant: "Potato",
    predicted_disease: "Late Blight",
    plant_scores: {
      Tomato: 0.47,
      Potato: 0.5,
      Pepper: 0.03
    }
  });

  assert.equal(result.plantName, "Potato");
  assert.equal(result.diseaseName, "Late Blight");
  assert.equal(result.isHealthy, false);
});

test("decodes extended tomato disease labels from the new plant_ai model", () => {
  const result = decodeLocalModelPayload({
    class: "Tomato_Leaf_Mold",
    confidence: 0.81
  });

  assert.equal(result.plantName, "Tomato");
  assert.equal(result.diseaseName, "Leaf Mold");
  assert.equal(result.isHealthy, false);
});

test("flags predictions below the reliability threshold", () => {
  assert.equal(isLowConfidencePrediction({ confidence: LOCAL_MODEL_MIN_CONFIDENCE - 0.01 }), true);
  assert.equal(isLowConfidencePrediction({ confidence: LOCAL_MODEL_MIN_CONFIDENCE }), false);
});

test("retries ambiguous closed-set predictions before routing into the catalog", () => {
  assert.equal(
    shouldRetryCatalogPrediction({
      confidence: 0.92,
      topClasses: [
        { className: "Tomato_Late_blight", confidence: 0.44 },
        { className: "Tomato_Early_blight", confidence: 0.37 }
      ],
      plantScores: {
        Tomato: 0.57,
        Potato: 0.43,
        Pepper: 0
      }
    }),
    true
  );
});

test("accepts confident catalog predictions with clear class and plant separation", () => {
  assert.equal(
    shouldRetryCatalogPrediction({
      confidence: 0.96,
      topClasses: [
        { className: "Potato___Late_blight", confidence: 0.96 },
        { className: "Tomato_Late_blight", confidence: 0.02 }
      ],
      plantScores: {
        Potato: 0.95,
        Tomato: 0.03,
        Pepper: 0.02
      }
    }),
    false
  );
});
