/**
 * File: backend/pages/api/admin/users.ts
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
import { z } from "zod";
import { withMethods } from "@/lib/api-handler";
import { requireAdmin } from "@/lib/auth-guards";
import { invalidateAuthGuardCache } from "@/lib/auth-guards";
import { getPool } from "@/lib/db";
import { userUpdateSchema } from "@/lib/validators";
import { sendError, sendSuccess } from "@/lib/response";
import { recordAdminAudit } from "@/lib/admin-audit";

const userDeleteSchema = z.object({
  userId: z.number().int().positive()
});

function isProcedureMismatchError(error: unknown) {
  return ["ER_SP_DOES_NOT_EXIST", "ER_SP_WRONG_NO_OF_ARGS", "ER_BAD_FIELD_ERROR"].includes(
    (error as { code?: string }).code || ""
  );
}

async function callAdminUserProcedure(sql: string, params: Array<number | string | null>) {
  await getPool().query(sql, params);
}

async function callAdminUserFallback(sql: string, params: Array<number | string | null>) {
  await getPool().execute(sql, params);
}

async function updateUserRoleStatus(userId: number, role: "user" | "admin" | null, accountStatus: "active" | "inactive" | "suspended" | null) {
  try {
    await callAdminUserProcedure("CALL sp_update_user_role_status(?, ?, ?)", [userId, role, accountStatus]);
  } catch (error) {
    if (!isProcedureMismatchError(error)) {
      throw error;
    }
    await callAdminUserFallback(
      `UPDATE users
       SET role = COALESCE(?, role),
           account_status = COALESCE(?, account_status)
       WHERE user_id = ?`,
      [role, accountStatus, userId]
    );
  }
}

async function deleteUserById(userId: number) {
  try {
    await callAdminUserProcedure("CALL sp_delete_user(?)", [userId]);
  } catch (error) {
    if (!isProcedureMismatchError(error)) {
      throw error;
    }
    await callAdminUserFallback("DELETE FROM users WHERE user_id = ?", [userId]);
  }
}

export default withMethods(["GET", "PUT", "DELETE"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) {
    return;
  }

  const audit = (input: Parameters<typeof recordAdminAudit>[1]) => recordAdminAudit(req, input);

  if (req.method === "GET") {
    const [rows] = await getPool().execute(
      `SELECT user_id, full_name, email, role, account_status, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 200`
    );

    return sendSuccess(res, rows);
  }

  if (req.method === "DELETE") {
    const parsedDelete = userDeleteSchema.safeParse(req.body);
    if (!parsedDelete.success) {
      await audit({
        action: "user.delete",
        targetType: "user",
        status: "failure",
        metadata: { reason: "validation_error" }
      });
      return sendError(res, "VALIDATION_ERROR", "userId is required for delete", 422, parsedDelete.error.flatten());
    }

    if (parsedDelete.data.userId === admin.userId) {
      await audit({
        action: "user.delete",
        targetType: "user",
        targetId: parsedDelete.data.userId,
        status: "failure",
        metadata: { reason: "self_delete_blocked" }
      });
      return sendError(res, "FORBIDDEN", "Admins cannot delete their own account", 403);
    }

    await deleteUserById(parsedDelete.data.userId);
    invalidateAuthGuardCache(parsedDelete.data.userId);
    await audit({
      action: "user.delete",
      targetType: "user",
      targetId: parsedDelete.data.userId,
      status: "success"
    });
    return sendSuccess(res, { message: "User deleted" });
  }

  const parsed = userUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    await audit({
      action: "user.update_role_status",
      targetType: "user",
      status: "failure",
      metadata: { reason: "validation_error" }
    });
    return sendError(res, "VALIDATION_ERROR", "Invalid user update payload", 422, parsed.error.flatten());
  }

  const { userId, role, accountStatus } = parsed.data;
  if (!role && !accountStatus) {
    await audit({
      action: "user.update_role_status",
      targetType: "user",
      targetId: userId,
      status: "failure",
      metadata: { reason: "empty_update" }
    });
    return sendError(res, "VALIDATION_ERROR", "At least one of role/accountStatus must be provided", 422);
  }

  if (userId === admin.userId) {
    if (role && role !== "admin") {
      await audit({
        action: "user.update_role_status",
        targetType: "user",
        targetId: userId,
        status: "failure",
        metadata: { reason: "self_demotion_blocked" }
      });
      return sendError(res, "FORBIDDEN", "Admins cannot remove their own admin role", 403);
    }
    if (accountStatus && accountStatus !== "active") {
      await audit({
        action: "user.update_role_status",
        targetType: "user",
        targetId: userId,
        status: "failure",
        metadata: { reason: "self_deactivation_blocked" }
      });
      return sendError(res, "FORBIDDEN", "Admins cannot deactivate their own account", 403);
    }
  }

  await updateUserRoleStatus(userId, role || null, accountStatus || null);
  invalidateAuthGuardCache(userId);

  await audit({
    action: "user.update_role_status",
    targetType: "user",
    targetId: userId,
    status: "success",
    metadata: { role: role || null, accountStatus: accountStatus || null }
  });
  return sendSuccess(res, { message: "User updated" });
});
