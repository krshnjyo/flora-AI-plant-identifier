/**
 * File: backend/lib/upload.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import fs from "fs";
import multer from "multer";
import type { NextApiRequest, NextApiResponse } from "next";
import { backendPath } from "@/lib/backend-root";

const uploadDir = backendPath("public", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/jpg"]);
const jsonTypes = new Set(["application/json", "text/json"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function hasAllowedImageExtension(name: string) {
  const lower = name.toLowerCase();
  const index = lower.lastIndexOf(".");
  if (index < 0) return false;
  return imageExtensions.has(lower.slice(index));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const imageUploader = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!imageTypes.has(file.mimetype) || !hasAllowedImageExtension(file.originalname)) {
      return cb(new Error("Only JPG, PNG, WEBP files are allowed"));
    }
    cb(null, true);
  }
});

const plantAssetUploader = multer({
  storage,
  limits: { fileSize: 7 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "jsonFileUpload") {
      if (!jsonTypes.has(file.mimetype) && !file.originalname.toLowerCase().endsWith(".json")) {
        return cb(new Error("Only JSON files are allowed"));
      }
      return cb(null, true);
    }

    if (file.fieldname === "plantImageUpload") {
      if (!imageTypes.has(file.mimetype) || !hasAllowedImageExtension(file.originalname)) {
        return cb(new Error("Only JPG, PNG, WEBP files are allowed"));
      }
      return cb(null, true);
    }

    return cb(new Error("Unexpected upload field"));
  }
});

const diseaseAssetUploader = multer({
  storage,
  limits: { fileSize: 7 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname !== "jsonFileUpload") {
      return cb(new Error("Unexpected upload field"));
    }
    if (!jsonTypes.has(file.mimetype) && !file.originalname.toLowerCase().endsWith(".json")) {
      return cb(new Error("Only JSON files are allowed"));
    }
    return cb(null, true);
  }
});

export function runImageUpload(req: NextApiRequest, res: NextApiResponse) {
  return new Promise<void>((resolve, reject) => {
    imageUploader.single("image")(req as any, res as any, (result: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }
      resolve();
    });
  });
}

export function runPlantAssetUpload(req: NextApiRequest, res: NextApiResponse) {
  return new Promise<void>((resolve, reject) => {
    plantAssetUploader.fields([
      { name: "jsonFileUpload", maxCount: 1 },
      { name: "plantImageUpload", maxCount: 1 }
    ])(req as any, res as any, (result: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }
      resolve();
    });
  });
}

export function runDiseaseAssetUpload(req: NextApiRequest, res: NextApiResponse) {
  return new Promise<void>((resolve, reject) => {
    diseaseAssetUploader.fields([{ name: "jsonFileUpload", maxCount: 1 }])(req as any, res as any, (result: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }
      resolve();
    });
  });
}
