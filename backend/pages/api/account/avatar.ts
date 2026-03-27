/**
 * File: backend/pages/api/account/avatar.ts
 * Purpose: Upload/remove profile image for authenticated user.
 */

import fs from "fs/promises";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
import { withMethods } from "@/lib/api-handler";
import { requireUser } from "@/lib/auth-guards";
import { getPool } from "@/lib/db";
import { runImageUpload } from "@/lib/upload";
import { sendError, sendSuccess } from "@/lib/response";
import { backendPath } from "@/lib/backend-root";

export const config = {
  api: {
    bodyParser: false
  }
};

type UploadedFile = {
  path: string;
  originalname: string;
};

type AvatarRow = {
  avatar_url: string | null;
};

function fileExtFromName(name: string) {
  const ext = path.extname(name).toLowerCase();
  return ext || ".jpg";
}

async function getCurrentAvatarUrl(userId: number) {
  const [rows] = await getPool().execute(
    "SELECT avatar_url FROM user_profiles WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return ((rows as AvatarRow[])[0]?.avatar_url || "") as string;
}

async function cleanupAvatarFile(avatarUrl: string) {
  if (!avatarUrl || !avatarUrl.startsWith("/profiles/")) return;
  const absolutePath = backendPath("public", avatarUrl.replace(/^\//, ""));
  try {
    await fs.unlink(absolutePath);
  } catch {
    // Best effort cleanup.
  }
}

export default withMethods(["POST", "DELETE"], async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === "DELETE") {
    const previousAvatar = await getCurrentAvatarUrl(user.userId);
    await getPool().execute(
      `INSERT INTO user_profiles (user_id, avatar_url)
       VALUES (?, NULL)
       ON DUPLICATE KEY UPDATE
         avatar_url = VALUES(avatar_url)`,
      [user.userId]
    );
    await cleanupAvatarFile(previousAvatar);
    return sendSuccess(res, { avatarUrl: "" });
  }

  try {
    await runImageUpload(req, res);
  } catch (error) {
    return sendError(res, "UPLOAD_ERROR", (error as Error).message, 400);
  }

  const file = (req as NextApiRequest & { file?: UploadedFile }).file;
  if (!file) {
    return sendError(res, "VALIDATION_ERROR", "Avatar image is required", 422);
  }

  const profilesDir = backendPath("public", "profiles");
  await fs.mkdir(profilesDir, { recursive: true });

  const fileName = `user-${user.userId}-${Date.now()}${fileExtFromName(file.originalname)}`;
  const destination = path.join(profilesDir, fileName);
  await fs.rename(file.path, destination);
  const nextAvatarUrl = `/profiles/${fileName}`;

  const previousAvatar = await getCurrentAvatarUrl(user.userId);
  try {
    await getPool().execute(
      `INSERT INTO user_profiles (user_id, avatar_url)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         avatar_url = VALUES(avatar_url)`,
      [user.userId, nextAvatarUrl]
    );
    await cleanupAvatarFile(previousAvatar);
  } catch (error) {
    // Avoid leaving unused profile images on disk if the DB write fails after
    // the file has already been moved into the public profiles directory.
    try {
      await fs.unlink(destination);
    } catch {
      // Best effort cleanup only.
    }
    throw error;
  }

  return sendSuccess(res, { avatarUrl: nextAvatarUrl });
});
