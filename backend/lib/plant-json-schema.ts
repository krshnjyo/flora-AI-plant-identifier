/**
 * File: backend/lib/plant-json-schema.ts
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

export const plantResultJsonSchema = z.object({
  plant_id: z.number().nullable(),
  common_name: z.string(),
  scientific_name: z.string(),
  species: z.string(),
  family: z.string(),
  image_url: z.string().nullable().optional(),
  media: z
    .object({
      gallery_images: z.array(z.string()).default([]),
      video_src: z.string().nullable().optional()
    })
    .optional(),
  plant_description: z.string(),
  growth_conditions: z.object({
    soil_requirements: z.string(),
    water_requirements: z.string(),
    sunlight_requirements: z.string(),
    temperature_conditions: z.string()
  }),
  watering_schedule: z.object({
    frequency: z.string(),
    chart_data: z.array(
      z.object({
        day: z.string(),
        water: z.boolean()
      })
    )
  }),
  growth_metrics: z.object({
    average_height_cm: z.number(),
    growth_rate: z.string(),
    chart_data: z.object({
      labels: z.array(z.string()),
      values: z.array(z.number())
    })
  }),
  disease_risk_levels: z.object({
    labels: z.array(z.string()),
    values: z.array(z.number())
  }),
  care_indicators: z.object({
    water_need_level: z.number(),
    sunlight_need_level: z.number(),
    maintenance_level: z.number()
  }),
  common_diseases: z.array(z.string()),
  toxicity_information: z.string(),
  confidence_score: z.number()
});

export type PlantResultJsonSchema = z.infer<typeof plantResultJsonSchema>;
