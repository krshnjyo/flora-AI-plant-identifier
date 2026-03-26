/**
 * File: frontend/lib/types/api.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

export type PlantResultJson = {
  plant_id: number | null;
  common_name: string;
  scientific_name: string;
  species: string;
  family: string;
  image_url?: string | null;
  media?: {
    gallery_images?: string[];
    video_src?: string | null;
  };
  plant_description: string;
  growth_conditions: {
    soil_requirements: string;
    water_requirements: string;
    sunlight_requirements: string;
    temperature_conditions: string;
  };
  watering_schedule: {
    frequency: string;
    chart_data: { day: string; water: boolean }[];
  };
  growth_metrics: {
    average_height_cm: number;
    growth_rate: string;
    chart_data: {
      labels: string[];
      values: number[];
    };
  };
  disease_risk_levels: {
    labels: string[];
    values: number[];
  };
  care_indicators: {
    water_need_level: number;
    sunlight_need_level: number;
    maintenance_level: number;
  };
  common_diseases: string[];
  toxicity_information: string;
  confidence_score: number;
};

export type ApiResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };
