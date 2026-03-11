/**
 * File: backend/lib/db.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import mysql, { Pool } from "mysql2/promise";
import { assertDatabaseEnv, env } from "@/lib/env";

// Singleton pool instance to prevent multiple connection pools in serverless/dev environments
let pool: Pool | null = null;

/**
 * Retrieves the active MySQL connection pool.
 * Initializes the pool if it hasn't been created yet.
 * 
 * @returns {Pool} The configured MySQL connection pool.
 * @throws {Error} If required environment variables are missing.
 */
export function getPool() {
  if (!pool) {
    // Fail early with a clear message instead of a generic mysql connection error.
    assertDatabaseEnv();
    pool = mysql.createPool({
      host: env.dbHost,
      user: env.dbUser,
      password: env.dbPassword,
      database: env.dbName,
      // Wait for relationships to free up if limit is reached
      waitForConnections: true,
      // Max concurrent connections. 12 is a reasonable default for standard hosting.
      connectionLimit: 12,
      queueLimit: 0,
      // Ensure UTC timestamps to avoid timezone confusion
      timezone: "Z"
    });
  }
  return pool;
}

/**
 * Executes a SQL query with parameters.
 * Wrapper around pool.execute to provide type safety and simpler syntax.
 * 
 * @template T The expected row type (defaults to any).
 * @param {string} sql - The SQL query string. Use ? for parameters.
 * @param {unknown[]} params - Array of parameters to bind to the query.
 * @returns {Promise<T[]>} A promise resolving to an array of rows.
 */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params);
  return rows as T[];
}
