/**
 * File: backend/lib/auth.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { NextApiRequest } from "next";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { parse as parseCookie, serialize as serializeCookie } from "cookie";
import { assertAuthEnv, env, getAuthCookieSameSite } from "@/lib/env";

const TOKEN_COOKIE = "flora_token";
const TOKEN_AGE_SEC = 60 * 60 * 24 * 7;

export type JwtPayload = {
  userId: number;
  email: string;
  role: "user" | "admin";
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload) {
  assertAuthEnv();

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: TOKEN_AGE_SEC,
    algorithm: "HS256",
    issuer: env.jwtIssuer,
    audience: env.jwtAudience
  });
}

export function verifyToken(token: string): JwtPayload {
  assertAuthEnv();

  return jwt.verify(token, env.jwtSecret, {
    algorithms: ["HS256"],
    issuer: env.jwtIssuer,
    audience: env.jwtAudience
  }) as JwtPayload;
}

export function getTokenFromRequest(req: NextApiRequest) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  const cookies = req.headers.cookie ? parseCookie(req.headers.cookie) : {};
  return cookies[TOKEN_COOKIE];
}

export function getUserFromRequest(req: NextApiRequest): JwtPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function buildAuthCookie(token: string) {
  const sameSite = getAuthCookieSameSite();
  return serializeCookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/",
    ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {}),
    maxAge: TOKEN_AGE_SEC
  });
}

export function clearAuthCookie() {
  const sameSite = getAuthCookieSameSite();
  return serializeCookie(TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/",
    ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {}),
    maxAge: 0
  });
}
