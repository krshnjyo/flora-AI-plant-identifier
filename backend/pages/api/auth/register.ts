/**
 * File: backend/pages/api/auth/register.ts
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

import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { getPool } from "@/lib/db";
import { hashPassword, signToken, buildAuthCookie } from "@/lib/auth";
import { createDefaultUserProfile } from "@/lib/user-profile";
import { registerSchema } from "@/lib/validators";
import { sendError, sendSuccess } from "@/lib/response";
import { consumeRateLimitHybrid, getRateLimitKey, setRateLimitHeaders } from "@/lib/rate-limit";

export default withMethods(["POST"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rateKey = getRateLimitKey("auth-register", req.headers["x-forwarded-for"] || req.socket.remoteAddress);
  const rate = await consumeRateLimitHybrid(rateKey, 10, 60_000);
  setRateLimitHeaders(res, rate);
  if (!rate.allowed) {
    return sendError(res, "RATE_LIMITED", "Too many registration attempts. Try again shortly.", 429);
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "VALIDATION_ERROR", "Invalid registration payload", 422, parsed.error.flatten());
  }

  const { fullName, email, password } = parsed.data;
  const pool = getPool();

  const passwordHash = await hashPassword(password);

  const connection = await pool.getConnection();
  let result: { insertId: number };
  try {
    await connection.beginTransaction();
    const [insertResult] = await connection.execute(
      "INSERT INTO users (full_name, email, password_hash, role, account_status) VALUES (?, ?, ?, 'user', 'active')",
      [fullName, email, passwordHash]
    );
    result = insertResult as { insertId: number };
    await createDefaultUserProfile(connection, result.insertId);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
      return sendError(res, "EMAIL_EXISTS", "Email already registered", 409);
    }
    throw error;
  } finally {
    connection.release();
  }

  const token = signToken({ userId: result.insertId, email, role: "user" });
  res.setHeader("Set-Cookie", buildAuthCookie(token));

  return sendSuccess(
    res,
    {
      user: {
        userId: result.insertId,
        fullName,
        email,
        role: "user"
      }
    },
    201
  );
});
