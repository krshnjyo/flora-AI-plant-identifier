/**
 * File: backend/lib/levenshtein.ts
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
 * Compute Levenshtein edit distance using only two rows of memory.
 *
 * Why this exists:
 * - Multiple resolvers need typo-tolerant matching.
 * - A shared implementation avoids copy/paste drift.
 * - This O(min(m, n)) space version is cheaper than full matrix allocation.
 *
 * Time complexity: O(m * n)
 * Space complexity: O(min(m, n))
 */
export function levenshteinDistance(leftInput: string, rightInput: string): number {
  if (leftInput === rightInput) return 0;
  if (!leftInput) return rightInput.length;
  if (!rightInput) return leftInput.length;

  // Ensure `right` is the shorter string to minimize row memory.
  let left = leftInput;
  let right = rightInput;
  if (right.length > left.length) {
    [left, right] = [right, left];
  }

  const previous = new Array(right.length + 1);
  const current = new Array(right.length + 1);

  for (let j = 0; j <= right.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left.charCodeAt(i - 1) === right.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // Deletion
        current[j - 1] + 1, // Insertion
        previous[j - 1] + cost // Substitution
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
}
