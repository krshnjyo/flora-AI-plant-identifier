/**
 * File: backend/lib/name-normalization.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

// Shared helpers to normalize model labels into stable text for DB matching.

const NON_MATCHING_LABELS = new Set(["none", "no disease", "healthy", "not visible", "unknown"]);

/**
 * Remove punctuation and compact whitespace so matchers receive consistent input strings.
 */
export function normalizeIdentifiedName(name: string) {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.,:;!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build multiple candidates from one model output string to improve matching resilience.
 */
export function buildNameCandidates(rawName: string) {
  const cleaned = normalizeIdentifiedName(rawName);
  if (!cleaned) return [];

  const candidates = new Set<string>();
  candidates.add(cleaned);

  cleaned
    .split(/[,/|]/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
    .forEach((part) => candidates.add(part));

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length >= 2) {
    candidates.add(words.slice(0, 2).join(" "));
  }
  if (words.length >= 1 && words[0].length > 2) {
    candidates.add(words[0]);
  }

  words
    .filter((word) => word.length > 2)
    .forEach((word) => {
      candidates.add(word);
      if (word.endsWith("s") && word.length > 4) {
        candidates.add(word.slice(0, -1));
      }
    });

  return Array.from(candidates);
}

/**
 * Normalize candidate arrays to lowercase unique values for SQL matching.
 */
export function buildLowercaseCandidates(candidates: string[]) {
  const deduped = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    if (normalized) deduped.add(normalized);
  }
  return Array.from(deduped);
}

/**
 * Sanitize disease label outputs from models and strip non-disease placeholders.
 */
export function sanitizeDiseaseLabel(value: string) {
  const normalized = normalizeIdentifiedName(value);
  if (!normalized) return "";
  if (NON_MATCHING_LABELS.has(normalized.toLowerCase())) {
    return "";
  }
  return normalized;
}

/**
 * Sanitize plant label outputs from models and strip invalid placeholders.
 */
export function sanitizePlantLabel(value: string) {
  const normalized = normalizeIdentifiedName(value);
  if (!normalized) return "";
  if (NON_MATCHING_LABELS.has(normalized.toLowerCase())) {
    return "";
  }
  return normalized;
}
