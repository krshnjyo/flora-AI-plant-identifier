/**
 * File: backend/lib/resolver-scoring.ts
 * Purpose: Shared scoring primitives used by resolver ranking logic.
 *
 * Responsibilities:
 * - Applies exact/contains weighting consistently.
 * - Adds typo-tolerance bonus via Levenshtein distance.
 * - Keeps scoring math centralized for easier tuning and testing.
 */

import { levenshteinDistance } from "./levenshtein.ts";

type ScoreWeights = {
  exact: number;
  contains: number;
  typoBase: number;
  typoPenalty: number;
  typoMaxDistance: number;
  typoMinInputLength?: number;
};

export function scoreTextSimilarity(field: string, input: string, weights: ScoreWeights) {
  let score = 0;

  if (field === input) {
    score += weights.exact;
  } else if (field.includes(input) || input.includes(field)) {
    score += weights.contains;
  }

  const minLength = weights.typoMinInputLength ?? 5;
  if (input.length >= minLength) {
    const distance = levenshteinDistance(field, input);
    if (distance <= weights.typoMaxDistance) {
      score += Math.max(0, weights.typoBase - distance * weights.typoPenalty);
    }
  }

  return score;
}
