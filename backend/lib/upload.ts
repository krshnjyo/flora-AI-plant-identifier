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
let lastIdentifyUploadCleanupAt = 0;

const IDENTIFY_UPLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const IDENTIFY_UPLOAD_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

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

/**
 * Opportunistically delete stale identify-upload images.
 *
 * Notes:
 * - Only files left in `public/uploads` are cleaned; admin plant/disease
 *   assets are moved out of this directory during their own upload flow.
 * - The function is throttled so identify requests do not repeatedly pay the
 *   cost of scanning the directory.
 */
export async function cleanupExpiredIdentifyUploads({
  olderThanMs = IDENTIFY_UPLOAD_RETENTION_MS,
  minIntervalMs = IDENTIFY_UPLOAD_CLEANUP_INTERVAL_MS,
  maxDeletes = 40
}: {
  olderThanMs?: number;
  minIntervalMs?: number;
  maxDeletes?: number;
} = {}) {
  const now = Date.now();
  if (now - lastIdentifyUploadCleanupAt < minIntervalMs) {
    return 0;
  }

  lastIdentifyUploadCleanupAt = now;
  const entries = await fs.promises.readdir(uploadDir, { withFileTypes: true });
  const staleFiles: Array<{ filePath: string; mtimeMs: number }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = `${uploadDir}/${entry.name}`;
    try {
      const stats = await fs.promises.stat(filePath);
      if (now - stats.mtimeMs >= olderThanMs) {
        staleFiles.push({ filePath, mtimeMs: stats.mtimeMs });
      }
    } catch {
      // Another request/process may have moved or deleted the file already.
    }
  }

  staleFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

  let deletedCount = 0;
  for (const staleFile of staleFiles.slice(0, maxDeletes)) {
    try {
      await fs.promises.unlink(staleFile.filePath);
      deletedCount += 1;
    } catch {
      // Best-effort cleanup only.
    }
  }

  return deletedCount;
}
