/**
 * File: backend/lib/disease-json-schema.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import { z } from "zod";

export const diseaseResultJsonSchema = z.object({
  disease_name: z.string(),
  affected_species: z.string(),
  image_url: z.string(),
  disease_category: z.string(),
  pathogen_type: z.string(),
  affected_parts: z.string(),
  favorable_conditions: z.string(),
  diagnosis_notes: z.string(),
  disease_description: z.string(),
  symptoms: z.string(),
  causes: z.string(),
  prevention_methods: z.string(),
  treatment_methods: z.string(),
  treatment_organic: z.string(),
  treatment_chemical: z.string(),
  recovery_time: z.string(),
  monitoring_tips: z.string(),
  severity_level: z.string()
});

export type DiseaseResultJsonSchema = z.infer<typeof diseaseResultJsonSchema>;
