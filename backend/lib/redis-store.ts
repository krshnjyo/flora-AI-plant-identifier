/**
 * File: backend/lib/redis-store.ts
 * Purpose: Minimal Redis REST client for rate limiting and short-lived caches.
 *
 * Responsibilities:
 * - Sends Redis commands to an Upstash-compatible REST endpoint.
 * - Exposes typed helpers for get/set/increment/ttl operations.
 * - Fails closed to `null`/`false` so API handlers can safely use in-memory fallback.
 */

import { env } from "@/lib/env";

type RedisResult<T> = {
  result: T;
};

function canUseRedis() {
  return Boolean(env.redisRestUrl && env.redisRestToken);
}

function buildCommandUrl(command: string, args: Array<string | number>) {
  const base = env.redisRestUrl.replace(/\/+$/, "");
  const path = [command, ...args.map((arg) => encodeURIComponent(String(arg)))].join("/");
  return `${base}/${path}`;
}

async function runRedisCommand<T>(command: string, args: Array<string | number>) {
  if (!canUseRedis()) {
    return null;
  }

  try {
    const response = await fetch(buildCommandUrl(command, args), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.redisRestToken}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as RedisResult<T>;
    return payload?.result ?? null;
  } catch {
    return null;
  }
}

export async function getRedisString(key: string) {
  const value = await runRedisCommand<string | null>("get", [key]);
  return typeof value === "string" ? value : null;
}

export async function setRedisString(key: string, value: string, ttlSec?: number) {
  const args: Array<string | number> = [key, value];
  if (typeof ttlSec === "number" && ttlSec > 0) {
    args.push("EX", Math.max(1, Math.floor(ttlSec)));
  }
  const result = await runRedisCommand<"OK" | null>("set", args);
  return result === "OK";
}

export async function deleteRedisKey(key: string) {
  const result = await runRedisCommand<number>("del", [key]);
  return typeof result === "number" && result > 0;
}

export async function incrementRedisCounter(key: string) {
  const value = await runRedisCommand<number>("incr", [key]);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

type WindowCounter = {
  count: number;
  ttlMs: number;
};

/**
 * Increment a counter key and ensure it has a bounded expiration window.
 */
export async function incrementRedisWindowCounter(key: string, windowMs: number): Promise<WindowCounter | null> {
  const count = await runRedisCommand<number>("incr", [key]);
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return null;
  }

  if (count === 1) {
    await runRedisCommand<number>("pexpire", [key, Math.max(1, Math.floor(windowMs))]);
  }

  const ttl = await runRedisCommand<number>("pttl", [key]);
  const ttlMs = typeof ttl === "number" && ttl > 0 ? ttl : windowMs;

  return {
    count,
    ttlMs
  };
}

export function isRedisConfigured() {
  return canUseRedis();
}
