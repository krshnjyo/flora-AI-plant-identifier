/**
 * File: backend/lib/db.ts
 * Purpose: PostgreSQL-backed database adapter with transitional compatibility.
 *
 * Responsibilities:
 * - Owns the shared `pg` pool configuration for backend runtime use.
 * - Preserves the existing `execute()` / transaction call shape while the
 *   wider SQL migration is completed step-by-step.
 * - Centralizes placeholder conversion from `?` to `$1..$N`.
 */

import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { Pool as PgPool } from "pg";
import { assertDatabaseEnv, env } from "./env.ts";

export type DatabaseMutationResult = {
  insertId: number | null;
  affectedRows: number;
  rowCount: number;
  command: string;
};

export type DatabaseExecuteResult<T extends QueryResultRow = QueryResultRow> = [
  T[] | DatabaseMutationResult,
  QueryResult<T>
];

export type DatabaseConnection = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  execute<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<DatabaseExecuteResult<T>>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

export type DatabasePool = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  execute<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<DatabaseExecuteResult<T>>;
  getConnection(): Promise<DatabaseConnection>;
  end(): Promise<void>;
};

let rawPool: PgPool | null = null;
let pool: DatabasePool | null = null;

function readDatabaseUrl() {
  assertDatabaseEnv();
  return env.databaseUrl;
}

export function convertQuestionPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeParams(params: unknown[]) {
  return params.map((value) => (value === undefined ? null : value));
}

export function preparePgQuery(sql: string, params: unknown[] = []) {
  return {
    text: convertQuestionPlaceholders(sql),
    values: normalizeParams(params)
  };
}

async function readInsertId(client: PoolClient) {
  try {
    const { rows } = await client.query<{ insert_id: string | number }>("SELECT LASTVAL() AS insert_id");
    const insertId = Number(rows[0]?.insert_id);
    return Number.isFinite(insertId) ? insertId : null;
  } catch {
    return null;
  }
}

async function queryWithClient<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
) {
  const prepared = preparePgQuery(sql, params);
  return client.query<T>(prepared.text, prepared.values);
}

async function executeWithClient<T extends QueryResultRow>(
  client: PoolClient,
  sql: string,
  params: unknown[] = []
): Promise<DatabaseExecuteResult<T>> {
  const result = await queryWithClient<T>(client, sql, params);
  if (result.command === "SELECT" || result.command === "WITH") {
    return [result.rows, result];
  }

  return [
    {
      insertId: result.command === "INSERT" ? await readInsertId(client) : null,
      affectedRows: result.rowCount ?? 0,
      rowCount: result.rowCount ?? 0,
      command: result.command
    },
    result
  ];
}

async function withClient<T>(work: (client: PoolClient) => Promise<T>) {
  const client = getRawPool().connect ? await getRawPool().connect() : null;
  if (!client) {
    throw new Error("PostgreSQL pool could not provide a client");
  }

  try {
    return await work(client);
  } finally {
    client.release();
  }
}

function wrapClient(client: PoolClient): DatabaseConnection {
  return {
    query(sql, params = []) {
      return queryWithClient(client, sql, params);
    },
    execute(sql, params = []) {
      return executeWithClient(client, sql, params);
    },
    async beginTransaction() {
      await client.query("BEGIN");
    },
    async commit() {
      await client.query("COMMIT");
    },
    async rollback() {
      await client.query("ROLLBACK");
    },
    release() {
      client.release();
    }
  };
}

function createPoolAdapter(raw: PgPool): DatabasePool {
  return {
    query(sql, params = []) {
      return withClient((client) => queryWithClient(client, sql, params));
    },
    execute(sql, params = []) {
      return withClient((client) => executeWithClient(client, sql, params));
    },
    async getConnection() {
      const client = await raw.connect();
      return wrapClient(client);
    },
    end() {
      return raw.end();
    }
  };
}

function getRawPool() {
  if (!rawPool) {
    rawPool = new PgPool({
      connectionString: readDatabaseUrl(),
      ssl: { rejectUnauthorized: true },
      max: 10
    });
  }

  return rawPool;
}

export function getPool() {
  if (!pool) {
    pool = createPoolAdapter(getRawPool());
  }

  return pool;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}
