/**
 * File: frontend/lib/navigation-transition.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

type PushRouter = {
  push: (href: string) => void;
};

export function navigateWithFloraTransition(
  router: PushRouter,
  href: string,
  delayMs?: number
) {
  void delayMs;
  router.push(href);
}
