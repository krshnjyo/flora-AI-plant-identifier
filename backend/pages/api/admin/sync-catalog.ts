/**
 * File: backend/pages/api/admin/sync-catalog.ts
 * Purpose: Defines an HTTP API route for the backend service.
 *
 * Responsibilities:
 * - Validates request input and route-specific query/body values
 * - Coordinates DB/service helpers to produce deterministic JSON responses
 * - Returns user-safe error messages while preserving operational stability
 *
 * Design Notes:
 * - Keeps controller logic thin by delegating reusable logic to lib helpers
 * - Uses consistent response envelope shapes so frontend handling is predictable
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/auth-guards";
import { sendError, sendSuccess } from "@/lib/response";
import { getBackendRootDir } from "@/lib/backend-root";
import { recordAdminAudit } from "@/lib/admin-audit";
import { bumpCacheVersion } from "@/lib/request-cache";

const execFileAsync = promisify(execFile);

export default withMethods(["POST"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }

  try {
    const { stdout, stderr } = await execFileAsync("node", ["scripts/sync-catalog.mjs"], {
      cwd: getBackendRootDir(),
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 4
    });

    await Promise.all([bumpCacheVersion("plants"), bumpCacheVersion("diseases")]);

    await recordAdminAudit(req, {
      action: "catalog.sync",
      targetType: "catalog",
      status: "success",
      metadata: {
        outputSize: `${stdout || ""}${stderr || ""}`.length
      }
    });
    return sendSuccess(res, {
      message: "Catalog sync completed",
      output: `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim()
    });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    await recordAdminAudit(req, {
      action: "catalog.sync",
      targetType: "catalog",
      status: "failure",
      metadata: {
        message: err.message || "Unknown sync failure"
      }
    });
    return sendError(
      res,
      "SYNC_FAILED",
      "JSON to DB sync failed",
      500,
      {
        message: err.message || "Unknown sync failure",
        output: `${err.stdout || ""}${err.stderr ? `\n${err.stderr}` : ""}`.trim()
      }
    );
  }
});
