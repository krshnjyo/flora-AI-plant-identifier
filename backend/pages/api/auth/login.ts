/**
 * File: backend/pages/api/auth/login.ts
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
import { verifyPassword, signToken, buildAuthCookie } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { sendError, sendSuccess } from "@/lib/response";
import { consumeRateLimitHybrid, getRateLimitKey, setRateLimitHeaders } from "@/lib/rate-limit";

type UserRow = {
  user_id: number;
  full_name: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
  account_status: string;
};

export default withMethods(["POST"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rateKey = getRateLimitKey("auth-login", req.headers["x-forwarded-for"] || req.socket.remoteAddress);
  const rate = await consumeRateLimitHybrid(rateKey, 20, 60_000);
  setRateLimitHeaders(res, rate);
  if (!rate.allowed) {
    return sendError(res, "RATE_LIMITED", "Too many login attempts. Try again shortly.", 429);
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "VALIDATION_ERROR", "Invalid login payload", 422, parsed.error.flatten());
  }

  const { email, password } = parsed.data;

  const [rows] = await getPool().execute(
    "SELECT user_id, full_name, email, password_hash, role, account_status FROM users WHERE email = ? LIMIT 1",
    [email]
  );

  const users = rows as UserRow[];
  if (users.length === 0) {
    return sendError(res, "INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const user = users[0];

  if (user.account_status !== "active") {
    return sendError(res, "ACCOUNT_INACTIVE", "User account is not active", 403);
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return sendError(res, "INVALID_CREDENTIALS", "Invalid email or password", 401);
  }

  const token = signToken({ userId: user.user_id, email: user.email, role: user.role });
  res.setHeader("Set-Cookie", buildAuthCookie(token));

  return sendSuccess(res, {
    user: {
      userId: user.user_id,
      fullName: user.full_name,
      email: user.email,
      role: user.role
    }
  });
});
