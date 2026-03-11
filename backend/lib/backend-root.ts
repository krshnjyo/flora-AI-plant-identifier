/**
 * File: backend/lib/backend-root.ts
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
import path from "path";

let cachedBackendRoot: string | null = null;

function isBackendRoot(candidateDir: string) {
  const packageJsonPath = path.join(candidateDir, "package.json");
  const dataDirPath = path.join(candidateDir, "data");
  const pagesDirPath = path.join(candidateDir, "pages");
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(dataDirPath) || !fs.existsSync(pagesDirPath)) {
    return false;
  }

  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name === "flora-backend";
  } catch {
    return false;
  }
}

/**
 * Resolve backend root regardless of whether process starts in:
 * - `/.../flora/backend`
 * - `/.../flora` (monorepo root with `npm --prefix backend ...`)
 */
export function getBackendRootDir() {
  if (cachedBackendRoot) {
    return cachedBackendRoot;
  }

  const cwd = process.cwd();
  const candidates = [cwd, path.join(cwd, "backend"), path.dirname(cwd), path.join(path.dirname(cwd), "backend")];

  for (const candidate of candidates) {
    if (isBackendRoot(candidate)) {
      cachedBackendRoot = candidate;
      return candidate;
    }
  }

  // Safe fallback for unusual environments.
  cachedBackendRoot = cwd;
  return cwd;
}

export function backendPath(...segments: string[]) {
  return path.join(getBackendRootDir(), ...segments);
}
