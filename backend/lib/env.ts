/**
 * File: backend/lib/env.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

/**
 * Read an environment variable and normalize empty strings to fallback.
 * 
 * @param {string} name - The name of the environment variable.
 * @param {string} fallback - The default value if the variable is missing or empty.
 * @returns {string} The value of the environment variable or the fallback.
 */
function readEnv(name: string, fallback = "") {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Centralized runtime environment values used across API handlers.
 * Accessing process.env directly is discouraged; use this object instead.
 */
export const env = {
  // Database Configuration
  dbHost: readEnv("DB_HOST"),
  dbUser: readEnv("DB_USER"),
  dbPassword: readEnv("DB_PASSWORD"),
  dbName: readEnv("DB_NAME", "flora"),

  // Authentication
  jwtSecret: readEnv("JWT_SECRET"),
  jwtIssuer: readEnv("JWT_ISSUER", "flora-api"),
  jwtAudience: readEnv("JWT_AUDIENCE", "flora-client"),
  authCookieSameSite: readEnv("AUTH_COOKIE_SAMESITE", "strict"),
  authCookieDomain: readEnv("AUTH_COOKIE_DOMAIN"),

  // Local model inference service
  localModelEndpoint: readEnv("LOCAL_MODEL_ENDPOINT", "http://127.0.0.1:5050/predict"),

  // Redis (Upstash-compatible REST endpoint)
  redisRestUrl: readEnv("UPSTASH_REDIS_REST_URL", readEnv("REDIS_REST_URL")),
  redisRestToken: readEnv("UPSTASH_REDIS_REST_TOKEN", readEnv("REDIS_REST_TOKEN")),

  // Security
  corsOrigin: readEnv("CORS_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000")
};

const insecureJwtSecretValues = new Set([
  "your_jwt_secret_key_here",
  "changeme",
  "change-me",
  "replace-me",
  "secret",
  "jwt-secret"
]);

/**
 * Production auth must not run on placeholder or trivially short secrets.
 * Keeping the check here gives all auth callers one consistent safety gate.
 */
export function hasSecureJwtSecret(secret = env.jwtSecret) {
  if (!secret) return false;
  const normalized = secret.trim().toLowerCase();
  if (insecureJwtSecretValues.has(normalized)) {
    return false;
  }
  return secret.length >= 32;
}

/**
 * Parse comma-separated CORS origins once and reuse.
 * Useful for configuring middleware or headers.
 * 
 * @returns {string[]} An array of allowed origins.
 */
export function getCorsAllowList() {
  const list = env.corsOrigin
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...new Set(list.length > 0 ? list : ["http://localhost:3000", "http://127.0.0.1:3000"])];
}

/**
 * Guard that database env values exist before creating a pool.
 * Should be called before any DB operation starts.
 * 
 * @throws {Error} If any required DB variable is missing.
 */
export function assertDatabaseEnv() {
  const missing = [
    !env.dbHost ? "DB_HOST" : "",
    !env.dbUser ? "DB_USER" : "",
    !env.dbName ? "DB_NAME" : ""
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing required DB env vars: ${missing.join(", ")}`);
  }
}

/**
 * Auth routes must fail fast when JWT signing is misconfigured. Running with a
 * placeholder secret would make every token forgeable.
 */
export function assertAuthEnv() {
  if (!env.jwtSecret) {
    throw new Error("Missing required auth env var: JWT_SECRET");
  }

  if (!hasSecureJwtSecret(env.jwtSecret)) {
    throw new Error("JWT_SECRET is insecure. Use a unique secret with at least 32 characters.");
  }
}

export function getAuthCookieSameSite() {
  const normalized = env.authCookieSameSite.trim().toLowerCase();
  if (normalized === "lax" || normalized === "none") {
    return normalized;
  }
  return "strict";
}
