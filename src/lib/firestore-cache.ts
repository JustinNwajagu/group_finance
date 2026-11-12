import "server-only";
import { connection } from "next/server";

type CacheEntry = {
  at: number;
  value: unknown;
};

const g = globalThis as typeof globalThis & {
  __klefFsCache?: Map<string, CacheEntry>;
};

function bucket(): Map<string, CacheEntry> {
  if (!g.__klefFsCache) g.__klefFsCache = new Map();
  return g.__klefFsCache;
}

/**
 * Keep collection snapshots warm across dashboard hops.
 * Was 8s — too short under Spark/free quotas and caused Home to re-scan
 * members+payments+dues on nearly every navigation (RESOURCE_EXHAUSTED).
 */
const DEFAULT_TTL_MS = 120_000;

export function invalidateStoreCache(prefix?: string): void {
  const map = bucket();
  if (!prefix) {
    map.clear();
    return;
  }
  for (const key of map.keys()) {
    if (key === prefix || key.startsWith(`${prefix}:`)) map.delete(key);
  }
}

export async function cachedLoad<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  // Mark this path as request-time before reading the clock (Cache Components).
  await connection();
  const map = bucket();
  const hit = map.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) {
    return hit.value as T;
  }
  const value = await loader();
  map.set(key, { at: now, value });
  return value;
}
