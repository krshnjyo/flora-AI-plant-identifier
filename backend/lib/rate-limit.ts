/**
 * File: backend/lib/rate-limit.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

import type { NextApiResponse } from "next";
import { incrementRedisWindowCounter } from "./redis-store.ts";

type RateBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
  limit: number;
};

const buckets = new Map<string, RateBucket>();

// Prevent unbounded memory growth when many unique keys hit the process.
let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 60_000;

function now() {
  return Date.now();
}

function pruneExpiredBuckets(currentTime: number) {
  if (currentTime - lastPruneAt < PRUNE_INTERVAL_MS) {
    return;
  }

  lastPruneAt = currentTime;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= currentTime) {
      buckets.delete(key);
    }
  }
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const current = now();
  pruneExpiredBuckets(current);
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= current) {
    const resetAt = current + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      retryAfterMs: 0,
      resetAt,
      limit
    };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, existing.resetAt - current),
      resetAt: existing.resetAt,
      limit
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.count),
    retryAfterMs: 0,
    resetAt: existing.resetAt,
    limit
  };
}

async function consumeRateLimitWithRedis(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const counter = await incrementRedisWindowCounter(key, windowMs);
  if (!counter) {
    return null;
  }

  const current = now();
  const allowed = counter.count <= limit;
  const resetAt = current + counter.ttlMs;

  return {
    allowed,
    remaining: allowed ? Math.max(0, limit - counter.count) : 0,
    retryAfterMs: allowed ? 0 : counter.ttlMs,
    resetAt,
    limit
  };
}

export async function consumeRateLimitHybrid(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const redisResult = await consumeRateLimitWithRedis(key, limit, windowMs);
  if (redisResult) {
    return redisResult;
  }
  return consumeRateLimit(key, limit, windowMs);
}

export function setRateLimitHeaders(res: NextApiResponse, result: RateLimitResult) {
  // RFC-style headers to help clients back off predictably.
  res.setHeader("X-RateLimit-Limit", String(result.limit));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed && result.retryAfterMs > 0) {
    res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
  }
}

export function getRateLimitKey(prefix: string, ip: string | string[] | undefined) {
  const normalized = Array.isArray(ip) ? ip[0] : ip || "unknown";
  // Remove accidental port suffixes and trim proxy chains.
  const first = normalized.split(",")[0]?.trim() || "unknown";
  const withoutPort = stripIpPort(first);
  return `${prefix}:${withoutPort || "unknown"}`;
}

function stripIpPort(value: string) {
  // [ipv6]:port -> ipv6
  const bracketMatch = value.match(/^\[([a-fA-F0-9:]+)\](?::\d+)?$/);
  if (bracketMatch?.[1]) {
    return bracketMatch[1];
  }

  // ipv4:port -> ipv4
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) {
    return value.replace(/:\d+$/, "");
  }

  // Keep raw IPv6 (for example "::1") untouched.
  return value;
}
