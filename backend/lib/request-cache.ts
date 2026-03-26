/**
 * File: backend/lib/request-cache.ts
 * Purpose: Small cache utility for API response payloads.
 *
 * Responsibilities:
 * - Reads from Redis when configured, with in-memory fallback.
 * - Writes short-lived JSON payloads for repeated list/search requests.
 * - Avoids throwing cache-layer errors into request paths.
 */

import { getRedisString, incrementRedisCounter, setRedisString } from "@/lib/redis-store";

type MemoryEntry = {
  value: string;
  expiresAt: number;
};

const memoryCache = new Map<string, MemoryEntry>();
const MAX_MEMORY_CACHE_ENTRIES = 600;
let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 45_000;

type CacheVersionEntry = {
  value: number;
  expiresAt: number;
};

const versionCache = new Map<string, CacheVersionEntry>();
const VERSION_CACHE_TTL_MS = 30_000;

function versionKey(resource: string) {
  return `cache-version:${resource}`;
}

function pruneExpiredMemory() {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) {
    return;
  }

  lastPruneAt = now;
  for (const [key, entry] of memoryCache) {
    if (entry.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
}

function enforceCacheCapacity() {
  if (memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES) {
    return;
  }

  // FIFO-style trim to keep memory bounded under high-cardinality search traffic.
  const overBy = memoryCache.size - MAX_MEMORY_CACHE_ENTRIES;
  let removed = 0;
  for (const key of memoryCache.keys()) {
    memoryCache.delete(key);
    removed += 1;
    if (removed >= overBy) break;
  }
}

function getMemoryCache(key: string) {
  pruneExpiredMemory();
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setMemoryCache(key: string, value: string, ttlSec: number) {
  pruneExpiredMemory();
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSec * 1000
  });
  enforceCacheCapacity();
}

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const redisValue = await getRedisString(key);
  if (redisValue) {
    try {
      return JSON.parse(redisValue) as T;
    } catch {
      // Ignore malformed cache payload and continue with fallback.
    }
  }

  const memoryValue = getMemoryCache(key);
  if (!memoryValue) return null;

  try {
    return JSON.parse(memoryValue) as T;
  } catch {
    memoryCache.delete(key);
    return null;
  }
}

export async function setCachedJson(key: string, value: unknown, ttlSec = 30) {
  try {
    const serialized = JSON.stringify(value);
    setMemoryCache(key, serialized, ttlSec);
    await setRedisString(key, serialized, ttlSec);
  } catch {
    // Cache writes are best-effort only.
  }
}

async function readVersionFromRedis(resource: string) {
  const raw = await getRedisString(versionKey(resource));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

export async function getCacheVersion(resource: string) {
  const key = versionKey(resource);
  const cached = versionCache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await readVersionFromRedis(resource);
  versionCache.set(key, {
    value,
    expiresAt: now + VERSION_CACHE_TTL_MS
  });
  return value;
}

export async function buildVersionedCacheKey(resource: string, baseKey: string) {
  const version = await getCacheVersion(resource);
  return `${baseKey}:v${version}`;
}

export async function bumpCacheVersion(resource: string) {
  const key = versionKey(resource);
  const now = Date.now();

  const redisValue = await incrementRedisCounter(key);
  const nextVersion = redisValue && redisValue > 0 ? redisValue : (versionCache.get(key)?.value ?? 0) + 1;

  versionCache.set(key, {
    value: nextVersion,
    expiresAt: now + VERSION_CACHE_TTL_MS
  });
}
