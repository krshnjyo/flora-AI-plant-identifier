/**
 * File: backend/pages/api/account/password.ts
 * Purpose: Authenticated password update endpoint.
 */

import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { requireUser } from "@/lib/auth-guards";
import { getPool } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendError, sendSuccess } from "@/lib/response";
import { consumeRateLimitHybrid, getRateLimitKey, setRateLimitHeaders } from "@/lib/rate-limit";

const passwordUpdateSchema = z.object({
  currentPassword: z.string().max(72).optional().default(""),
  newPassword: z.string().min(8).max(72)
});

type PasswordRow = {
  password_hash: string;
};

export default withMethods(["PUT"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const rateKey = getRateLimitKey("account-password", req.headers["x-forwarded-for"] || req.socket.remoteAddress);
  const rate = await consumeRateLimitHybrid(rateKey, 20, 60_000);
  setRateLimitHeaders(res, rate);
  if (!rate.allowed) {
    return sendError(res, "RATE_LIMITED", "Too many password update attempts. Try again shortly.", 429);
  }

  const user = await requireUser(req, res);
  if (!user) return;
  const parsed = passwordUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "VALIDATION_ERROR", "Invalid password payload", 422, parsed.error.flatten());
  }

  const { currentPassword, newPassword } = parsed.data;
  if (currentPassword === newPassword) {
    return sendError(res, "VALIDATION_ERROR", "New password must be different from current password", 422);
  }

  const [rows] = await getPool().execute("SELECT password_hash FROM users WHERE user_id = ? LIMIT 1", [user.userId]);
  const current = (rows as PasswordRow[])[0];
  if (!current) {
    return sendError(res, "USER_NOT_FOUND", "User account not found", 404);
  }

  if (currentPassword.trim().length === 0) {
    return sendError(res, "VALIDATION_ERROR", "Current password is required", 422);
  }

  const validCurrent = await verifyPassword(currentPassword, current.password_hash);
  if (!validCurrent) {
    return sendError(res, "INVALID_CREDENTIALS", "Current password is incorrect", 401);
  }

  const nextHash = await hashPassword(newPassword);
  await getPool().execute("UPDATE users SET password_hash = ? WHERE user_id = ?", [nextHash, user.userId]);

  return sendSuccess(res, { message: "Password updated successfully" });
});
