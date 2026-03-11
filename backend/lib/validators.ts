/**
 * File: backend/lib/validators.ts
 * Purpose: Centralized request payload validation using Zod schemas.
 *
 * Responsibilities:
 * - Defines one validation contract per API payload type.
 * - Ensures consistent bounds/required fields across handlers.
 * - Prevents malformed input from reaching DB and service layers.
 */

import { z } from "zod";

// Registration payload sent by /api/auth/register.
export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8).max(72)
});

// Login payload sent by /api/auth/login.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72)
});

// Admin create/update payload for plants.
export const plantAdminSchema = z.object({
  plantId: z.number().int().positive().optional(),
  commonName: z.string().trim().min(2).max(100),
  scientificName: z.string().trim().min(2).max(150),
  species: z.string().trim().min(2).max(100),
  confidenceScore: z.number().min(0).max(100),
  jsonFile: z.string().trim().min(5).max(255)
});

// Admin create/update payload for diseases.
export const diseaseAdminSchema = z.object({
  diseaseName: z.string().trim().min(2).max(150),
  affectedSpecies: z.string().trim().max(255).optional().default(""),
  diseaseDescription: z.string().trim().min(10),
  symptoms: z.string().trim().min(5),
  causes: z.string().trim().min(5),
  preventionMethods: z.string().trim().min(5),
  treatmentMethods: z.string().trim().min(5),
  severityLevel: z.string().trim().min(3).max(50),
  jsonFile: z.string().trim().max(255).optional(),
  primaryPlantId: z.number().int().positive().nullable().optional()
});

// Admin user role/status update payload.
export const userUpdateSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["user", "admin"]).optional(),
  accountStatus: z.enum(["active", "inactive", "suspended"]).optional()
});
