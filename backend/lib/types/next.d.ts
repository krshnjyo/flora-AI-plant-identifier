/**
 * File: backend/lib/types/next.d.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import "next";
/// <reference types="multer" />

declare module "next" {
  interface NextApiRequest {
    file?: Express.Multer.File;
  }
}

export {};
