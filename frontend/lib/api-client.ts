/**
 * File: frontend/lib/api-client.ts
 * Purpose: Shared utility/service module used across routes and components.
 *
 * Responsibilities:
 * - Provides reusable logic to reduce duplication and improve consistency
 * - Keeps domain-specific operations centralized for easier testing/maintenance
 *
 * Design Notes:
 * - Designed for reuse by multiple features to enforce single-source behavior
 */

const API_BASE_ENV = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/$/, "");
const AUTH_EVENT = "flora-auth-change";
const DEFAULT_TIMEOUT_MS = 15_000;

const LOCAL_FALLBACK_BASES = ["http://localhost:4000", "http://127.0.0.1:4000"];
let preferredApiBase: string | null = null;

type ApiError = {
  code?: string;
  message?: string;
};

type ApiResponseShape<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error?: ApiError;
    };

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function dedupeBases(bases: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of bases) {
    const base = String(raw || "").trim().replace(/\/$/, "");
    if (!base || seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }

  return out;
}

function canUseLocalFallbacks() {
  if (typeof window === "undefined") {
    return process.env.NODE_ENV !== "production";
  }

  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLoopbackBase(base: string) {
  try {
    const hostname = new URL(base).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function resolveConfiguredApiBase() {
  if (!API_BASE_ENV) {
    return "";
  }

  if (typeof window !== "undefined" && !canUseLocalFallbacks() && isLoopbackBase(API_BASE_ENV)) {
    return "";
  }

  return API_BASE_ENV;
}

function resolveApiBases() {
  const configuredApiBase = resolveConfiguredApiBase();
  const fromWindow: string[] = [];
  if (typeof window !== "undefined" && canUseLocalFallbacks()) {
    const hostname = window.location.hostname;
    if (hostname) {
      fromWindow.push(`http://${hostname}:4000`);
    }
  }

  return dedupeBases([
    configuredApiBase,
    preferredApiBase || "",
    ...fromWindow,
    ...(canUseLocalFallbacks() ? LOCAL_FALLBACK_BASES : [])
  ]);
}

export function getApiErrorMessage<T>(payload: ApiResponseShape<T> | null, fallback: string) {
  if (payload && !payload.success) {
    return payload.error?.message || fallback;
  }
  return fallback;
}

export function apiUrl(path: string, base?: string) {
  const normalized = normalizePath(path);
  const resolvedBase = (base || resolveConfiguredApiBase() || resolveApiBases()[0] || "").replace(/\/$/, "");
  if (!resolvedBase) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required for backend asset URLs in this environment.");
  }
  return `${resolvedBase}${normalized}`;
}

export function notifyAuthChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function isNetworkFetchError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "TypeError" || /fetch failed|failed to fetch|networkerror/i.test(error.message);
}

async function fetchWithOptionalTimeout(url: string, init: RequestInit, timeoutMs: number) {
  if (init.signal) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const normalized = normalizePath(path);
  const bases = resolveApiBases();
  let lastError: unknown = null;

  if (bases.length === 0) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required for API requests in this environment.");
  }

  for (const base of bases) {
    try {
      const response = await fetchWithOptionalTimeout(
        `${base}${normalized}`,
        {
          ...init,
          headers: init.headers,
          credentials: "include"
        },
        DEFAULT_TIMEOUT_MS
      );
      preferredApiBase = base;
      return response;
    } catch (error) {
      lastError = error;
      if (!isNetworkFetchError(error)) {
        throw error;
      }
    }
  }

  throw (lastError instanceof Error ? lastError : new Error("Network request failed"));
}

/**
 * Fetch an API route and parse JSON with a consistent fallback shape.
 */
export async function apiFetchJson<T>(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, init);
  let json: ApiResponseShape<T> | null = null;

  try {
    json = (await response.json()) as ApiResponseShape<T>;
  } catch {
    json = null;
  }

  return { response, json };
}

export function toAssetUrl(assetPath: string | null | undefined) {
  if (!assetPath) {
    return "";
  }

  if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }

  return apiUrl(assetPath);
}
