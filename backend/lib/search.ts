/**
 * File: backend/lib/search.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

/**
 * Normalize free-text query terms from query params/body payloads.
 *
 * Why this exists:
 * - Keeps search logic consistent across endpoints.
 * - Prevents accidental oversized inputs from generating expensive SQL patterns.
 *
 * Time complexity: O(n)
 * Space complexity: O(n)
 */
export function normalizeSearchTerm(raw: unknown, maxLength = 96): string {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Escape SQL LIKE wildcards so user input is treated as a literal search token.
 *
 * Notes:
 * - `%` and `_` are escaped because they are wildcard operators in LIKE.
 * - Backslash itself is escaped to preserve intent.
 */
export function toSqlContainsPattern(value: string): string {
  const escaped = value.replace(/[\\%_]/g, "\\$&");
  return `%${escaped}%`;
}

/**
 * Build a boolean full-text query from normalized user input.
 *
 * Example:
 * - "late blight" -> "+late* +blight*"
 */
export function toSqlBooleanFullText(value: string): string {
  const tokens = value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 8);

  return tokens.map((token) => `+${token}*`).join(" ");
}
