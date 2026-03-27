/**
 * File: backend/tests/resolver-scoring.test.ts
 * Purpose: Unit tests for resolver scoring primitives and candidate normalization.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { scoreTextSimilarity } from "../lib/resolver-scoring.ts";
import { buildLowercaseCandidates, buildNameCandidates, sanitizeDiseaseLabel } from "../lib/name-normalization.ts";

test("scoreTextSimilarity ranks exact > contains > typo", () => {
  const weights = {
    exact: 100,
    contains: 60,
    typoBase: 40,
    typoPenalty: 8,
    typoMaxDistance: 2
  } as const;

  const exact = scoreTextSimilarity("late blight", "late blight", weights);
  const contains = scoreTextSimilarity("late blight", "blight", weights);
  const typo = scoreTextSimilarity("late blight", "late blihgt", weights);

  assert.ok(exact > contains);
  assert.ok(contains >= typo);
});

test("scoreTextSimilarity ignores typo bonus for short tokens", () => {
  const score = scoreTextSimilarity("rust", "ru", {
    exact: 10,
    contains: 5,
    typoBase: 30,
    typoPenalty: 10,
    typoMaxDistance: 2
  });

  // Contains score may apply, but typo-specific boost should not inflate small inputs.
  assert.equal(score, 5);
});

test("name candidate normalization deduplicates and lowers values", () => {
  const candidates = buildLowercaseCandidates(buildNameCandidates("Late Blight / late blight"));
  assert.ok(candidates.includes("late blight"));
  assert.equal(new Set(candidates).size, candidates.length);
});

test("sanitizeDiseaseLabel strips non-disease placeholders", () => {
  assert.equal(sanitizeDiseaseLabel("NONE"), "");
  assert.equal(sanitizeDiseaseLabel("Healthy"), "");
  assert.equal(sanitizeDiseaseLabel("Powdery Mildew"), "Powdery Mildew");
});
