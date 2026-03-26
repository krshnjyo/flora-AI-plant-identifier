/**
 * File: backend/lib/user-profile.ts
 * Purpose: Ensure optional user profile metadata storage exists.
 */

import { getPool } from "@/lib/db";

let profileTableReady = false;
let profileTableReadyPromise: Promise<void> | null = null;

type ProfileColumnDefinition = {
  name: string;
  ddl: string;
};

const requiredColumns: ProfileColumnDefinition[] = [
  {
    name: "bio",
    ddl: "ALTER TABLE user_profiles ADD COLUMN bio TEXT NULL"
  },
  {
    name: "avatar_url",
    ddl: "ALTER TABLE user_profiles ADD COLUMN avatar_url VARCHAR(255) NULL"
  },
  {
    name: "default_output",
    ddl: "ALTER TABLE user_profiles ADD COLUMN default_output ENUM('smart','species','disease') NOT NULL DEFAULT 'smart'"
  },
  {
    name: "scan_notifications",
    ddl: "ALTER TABLE user_profiles ADD COLUMN scan_notifications TINYINT(1) NOT NULL DEFAULT 1"
  },
  {
    name: "email_notifications",
    ddl: "ALTER TABLE user_profiles ADD COLUMN email_notifications TINYINT(1) NOT NULL DEFAULT 1"
  },
  {
    name: "login_alerts",
    ddl: "ALTER TABLE user_profiles ADD COLUMN login_alerts TINYINT(1) NOT NULL DEFAULT 1"
  },
  {
    name: "two_factor_enabled",
    ddl: "ALTER TABLE user_profiles ADD COLUMN two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0"
  },
  {
    name: "allow_model_fallback",
    ddl: "ALTER TABLE user_profiles ADD COLUMN allow_model_fallback TINYINT(1) NOT NULL DEFAULT 1"
  },
  {
    name: "audit_retention_days",
    ddl: "ALTER TABLE user_profiles ADD COLUMN audit_retention_days INT NOT NULL DEFAULT 90"
  },
  {
    name: "incident_alerts",
    ddl: "ALTER TABLE user_profiles ADD COLUMN incident_alerts TINYINT(1) NOT NULL DEFAULT 1"
  },
  {
    name: "updated_at",
    ddl: "ALTER TABLE user_profiles ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  }
];

/**
 * Ensure newer optional profile columns exist on older databases without
 * assuming every deployment has already re-run the latest schema migration.
 */
async function ensureProfileColumns() {
  const pool = getPool();
  const [existingColumns] = await pool.execute("SHOW COLUMNS FROM user_profiles");
  const existingColumnNames = new Set(
    (existingColumns as Array<{ Field?: string; field?: string }>).map((column) => column.Field || column.field || "")
  );

  for (const column of requiredColumns) {
    if (!existingColumnNames.has(column.name)) {
      await pool.execute(column.ddl);
      existingColumnNames.add(column.name);
    }
  }
}

/**
 * Create user_profiles table on-demand so account features work
 * even on instances that were initialized before this feature.
 */
export async function ensureUserProfileTable() {
  if (profileTableReady) return;
  if (profileTableReadyPromise) {
    await profileTableReadyPromise;
    return;
  }

  profileTableReadyPromise = (async () => {
    await getPool().execute(
      `CREATE TABLE IF NOT EXISTS user_profiles (
         user_id INT PRIMARY KEY,
         bio TEXT NULL,
         avatar_url VARCHAR(255) NULL,
         default_output ENUM('smart','species','disease') NOT NULL DEFAULT 'smart',
         scan_notifications TINYINT(1) NOT NULL DEFAULT 1,
         email_notifications TINYINT(1) NOT NULL DEFAULT 1,
         login_alerts TINYINT(1) NOT NULL DEFAULT 1,
         two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
         allow_model_fallback TINYINT(1) NOT NULL DEFAULT 1,
         audit_retention_days INT NOT NULL DEFAULT 90,
         incident_alerts TINYINT(1) NOT NULL DEFAULT 1,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         CONSTRAINT fk_user_profiles_user
           FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
       )`
    );

    await ensureProfileColumns();
    profileTableReady = true;
  })();

  try {
    await profileTableReadyPromise;
  } finally {
    profileTableReadyPromise = null;
  }
}
