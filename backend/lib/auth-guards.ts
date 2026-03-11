/**
 * File: backend/lib/auth-guards.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { JwtPayload } from "@/lib/auth";
import { getUserFromRequest } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { sendError } from "@/lib/response";

type UserGuardRow = {
  user_id: number;
  email: string;
  role: "user" | "admin";
  account_status: "active" | "inactive" | "suspended";
};

type CachedAuthUser = {
  payload: JwtPayload;
  accountStatus: UserGuardRow["account_status"];
  expiresAt: number;
};

const USER_CACHE_TTL_MS = 20_000;
const userCache = new Map<number, CachedAuthUser>();

/**
 * Explicit cache invalidation hook for mutation routes.
 *
 * Why this exists:
 * - Guard cache is short-lived, but profile/role/status writes should take effect
 *   immediately instead of waiting for TTL expiry.
 *
 * Complexity:
 * - Single-user invalidation: O(1)
 * - Global invalidation: O(n) where n is cached user count.
 */
export function invalidateAuthGuardCache(userId?: number) {
  if (typeof userId === "number" && Number.isFinite(userId)) {
    userCache.delete(userId);
    return;
  }
  userCache.clear();
}

/**
 * Resolve user role/status from DB with a short TTL cache.
 *
 * Why this exists:
 * - JWT claims can become stale after admin role/status changes.
 * - This guard ensures suspended/inactive users lose API access quickly.
 *
 * Complexity:
 * - Cache hit: O(1)
 * - Cache miss: O(1) query by indexed primary key.
 */
async function getUserFromDb(userId: number) {
  const cached = userCache.get(userId);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached;
  }

  const [rows] = await getPool().execute(
    `SELECT user_id, email, role, account_status
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );

  const row = (rows as UserGuardRow[])[0];
  if (!row) {
    userCache.delete(userId);
    return null;
  }

  const nextValue: CachedAuthUser = {
    payload: {
      userId: row.user_id,
      email: row.email,
      role: row.role
    },
    accountStatus: row.account_status,
    expiresAt: now + USER_CACHE_TTL_MS
  };

  userCache.set(userId, nextValue);
  return nextValue;
}

export async function requireUser(req: NextApiRequest, res: NextApiResponse) {
  const tokenUser = getUserFromRequest(req);
  if (!tokenUser) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return null;
  }

  const dbUser = await getUserFromDb(tokenUser.userId);
  if (!dbUser) {
    sendError(res, "UNAUTHORIZED", "Authentication required", 401);
    return null;
  }

  if (dbUser.accountStatus !== "active") {
    sendError(res, "ACCOUNT_INACTIVE", "User account is not active", 403);
    return null;
  }

  return dbUser.payload;
}

/**
 * Require an authenticated active admin user.
 *
 * Role is validated against DB-backed claims from requireUser() to avoid
 * privilege drift when tokens outlive role updates.
 */
export async function requireAdmin(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    sendError(res, "FORBIDDEN", "Admin access required", 403);
    return null;
  }

  return user;
}
