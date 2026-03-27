/**
 * File: backend/lib/user-profile.ts
 * Purpose: Small helpers for guaranteed user profile rows.
 *
 * The schema already owns table/column creation. Routes should not mutate
 * database structure at runtime. What they do need is a safe way to ensure a
 * newly created user gets the companion `user_profiles` row immediately.
 */

import type { Pool, PoolConnection } from "mysql2/promise";

type DbExecutor = Pool | PoolConnection;

/**
 * Create the companion profile row if it does not exist yet.
 *
 * Notes:
 * - Uses schema defaults for all preference fields so there is one source of
 *   truth for baseline account preferences.
 * - Safe to call repeatedly because duplicate inserts collapse into a no-op.
 */
export async function createDefaultUserProfile(executor: DbExecutor, userId: number) {
  await executor.execute(
    `INSERT INTO user_profiles (user_id)
     VALUES (?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId]
  );
}
