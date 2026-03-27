/**
 * File: backend/pages/api/account/profile.ts
 * Purpose: Authenticated profile read/update endpoints for user settings.
 */

import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { invalidateAuthGuardCache, requireUser } from "@/lib/auth-guards";
import { buildAuthCookie, signToken } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { sendError, sendSuccess } from "@/lib/response";

type ProfileRow = {
  user_id: number;
  full_name: string;
  email: string;
  role: "user" | "admin";
  account_status: "active" | "inactive" | "suspended";
  created_at: string;
  bio: string | null;
  avatar_url: string | null;
  default_output: "smart" | "species" | "disease" | null;
  scan_notifications: number | null;
  email_notifications: number | null;
  login_alerts: number | null;
  two_factor_enabled: number | null;
  allow_model_fallback: number | null;
  audit_retention_days: number | null;
  incident_alerts: number | null;
};

function isDuplicateEntryError(error: unknown) {
  return ["ER_DUP_ENTRY", "23505"].includes((error as { code?: string }).code || "");
}

const outputModeSchema = z.enum(["smart", "species", "disease"]);
const auditRetentionSchema = z.union([z.literal(30), z.literal(90), z.literal(365)]);

const preferenceUpdateSchema = z.object({
  defaultOutput: outputModeSchema.optional(),
  scanNotifications: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  loginAlerts: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional(),
  allowModelFallback: z.boolean().optional(),
  auditRetentionDays: auditRetentionSchema.optional(),
  incidentAlerts: z.boolean().optional()
});

const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(150).optional(),
  bio: z.string().trim().max(1500).optional(),
  preferences: preferenceUpdateSchema.optional()
});

async function getProfile(userId: number) {
  const [rows] = await getPool().execute(
    `SELECT
       u.user_id,
       u.full_name,
       u.email,
       u.role,
       u.account_status,
       u.created_at,
       up.bio,
       up.avatar_url,
       up.default_output,
       up.scan_notifications,
       up.email_notifications,
       up.login_alerts,
       up.two_factor_enabled,
       up.allow_model_fallback,
       up.audit_retention_days,
       up.incident_alerts
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.user_id
     WHERE u.user_id = ?
     LIMIT 1`,
    [userId]
  );

  return ((rows as ProfileRow[])[0] || null) as ProfileRow | null;
}

function toProfileResponse(profile: ProfileRow) {
  return {
    userId: profile.user_id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role,
    accountStatus: profile.account_status,
    createdAt: profile.created_at,
    bio: profile.bio || "",
    avatarUrl: profile.avatar_url || "",
    preferences: {
      defaultOutput: profile.default_output || "smart",
      scanNotifications: Boolean(profile.scan_notifications ?? 1),
      emailNotifications: Boolean(profile.email_notifications ?? 1),
      loginAlerts: Boolean(profile.login_alerts ?? 1),
      twoFactorEnabled: Boolean(profile.two_factor_enabled ?? 0),
      allowModelFallback: Boolean(profile.allow_model_fallback ?? 1),
      auditRetentionDays: profile.audit_retention_days === 30 || profile.audit_retention_days === 365 ? profile.audit_retention_days : 90,
      incidentAlerts: Boolean(profile.incident_alerts ?? 1)
    }
  };
}

export default withMethods(["GET", "PUT"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "GET") {
    const profile = await getProfile(user.userId);
    if (!profile) {
      return sendError(res, "USER_NOT_FOUND", "User account not found", 404);
    }

    return sendSuccess(res, toProfileResponse(profile));
  }

  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, "VALIDATION_ERROR", "Invalid profile payload", 422, parsed.error.flatten());
  }

  const patch = parsed.data;
  if (patch.fullName === undefined && patch.email === undefined && patch.bio === undefined && patch.preferences === undefined) {
    return sendError(res, "VALIDATION_ERROR", "No profile changes provided", 422);
  }

  const currentProfile = await getProfile(user.userId);
  if (!currentProfile) {
    return sendError(res, "USER_NOT_FOUND", "User account not found", 404);
  }

  const nextFullName = patch.fullName ?? currentProfile.full_name;
  const nextEmail = patch.email ?? currentProfile.email;
  const nextBio = patch.bio ?? currentProfile.bio ?? "";
  const nextPreferences = {
    defaultOutput: patch.preferences?.defaultOutput ?? currentProfile.default_output ?? "smart",
    scanNotifications: patch.preferences?.scanNotifications ?? Boolean(currentProfile.scan_notifications ?? 1),
    emailNotifications: patch.preferences?.emailNotifications ?? Boolean(currentProfile.email_notifications ?? 1),
    loginAlerts: patch.preferences?.loginAlerts ?? Boolean(currentProfile.login_alerts ?? 1),
    twoFactorEnabled: patch.preferences?.twoFactorEnabled ?? Boolean(currentProfile.two_factor_enabled ?? 0),
    allowModelFallback: patch.preferences?.allowModelFallback ?? Boolean(currentProfile.allow_model_fallback ?? 1),
    auditRetentionDays:
      patch.preferences?.auditRetentionDays ??
      (currentProfile.audit_retention_days === 30 || currentProfile.audit_retention_days === 365
        ? currentProfile.audit_retention_days
        : 90),
    incidentAlerts: patch.preferences?.incidentAlerts ?? Boolean(currentProfile.incident_alerts ?? 1)
  };

  const pool = getPool();

  if (nextEmail !== currentProfile.email) {
    const [existingRows] = await pool.execute(
      "SELECT user_id FROM users WHERE email = ? AND user_id <> ? LIMIT 1",
      [nextEmail, user.userId]
    );
    if ((existingRows as Array<{ user_id: number }>).length > 0) {
      return sendError(res, "EMAIL_EXISTS", "Email already registered", 409);
    }
  }

  // Keep account/profile writes atomic so partial updates cannot leave
  // users and user_profiles out of sync when one write fails.
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "UPDATE users SET full_name = ?, email = ? WHERE user_id = ?",
      [nextFullName, nextEmail, user.userId]
    );

    await connection.execute(
      `INSERT INTO user_profiles (
         user_id,
         bio,
         default_output,
         scan_notifications,
         email_notifications,
         login_alerts,
         two_factor_enabled,
         allow_model_fallback,
         audit_retention_days,
         incident_alerts
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         bio = EXCLUDED.bio,
         default_output = EXCLUDED.default_output,
         scan_notifications = EXCLUDED.scan_notifications,
         email_notifications = EXCLUDED.email_notifications,
         login_alerts = EXCLUDED.login_alerts,
         two_factor_enabled = EXCLUDED.two_factor_enabled,
         allow_model_fallback = EXCLUDED.allow_model_fallback,
         audit_retention_days = EXCLUDED.audit_retention_days,
         incident_alerts = EXCLUDED.incident_alerts`,
      [
        user.userId,
        nextBio,
        nextPreferences.defaultOutput,
        nextPreferences.scanNotifications,
        nextPreferences.emailNotifications,
        nextPreferences.loginAlerts,
        nextPreferences.twoFactorEnabled,
        nextPreferences.allowModelFallback,
        nextPreferences.auditRetentionDays,
        nextPreferences.incidentAlerts
      ]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isDuplicateEntryError(error)) {
      return sendError(res, "EMAIL_EXISTS", "Email already registered", 409);
    }
    throw error;
  } finally {
    connection.release();
  }

  // Keep JWT claims in sync after profile updates (especially email changes).
  const nextRole = currentProfile.role || user.role;
  const token = signToken({ userId: user.userId, email: nextEmail, role: nextRole });
  res.setHeader("Set-Cookie", buildAuthCookie(token));
  invalidateAuthGuardCache(user.userId);

  const profile = await getProfile(user.userId);
  if (!profile) {
    return sendError(res, "USER_NOT_FOUND", "User account not found", 404);
  }

  return sendSuccess(res, toProfileResponse(profile));
});
