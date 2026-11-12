import "server-only";
import { connection } from "next/server";

type CacheEntry = {
  at: number;
  value: unknown;
};

const g = globalThis as typeof globalThis & {
  __klefFsCache?: Map<string, CacheEntry>;
  __klefFsInflight?: Map<string, Promise<unknown>>;
};

function bucket(): Map<string, CacheEntry> {
  if (!g.__klefFsCache) g.__klefFsCache = new Map();
  return g.__klefFsCache;
}

function inflightBucket(): Map<string, Promise<unknown>> {
  if (!g.__klefFsInflight) g.__klefFsInflight = new Map();
  return g.__klefFsInflight;
}

/**
 * Keep collection snapshots warm across dashboard hops.
 * Long enough to reuse across navigation; short enough to pick up writes.
 */
const DEFAULT_TTL_MS = 60_000;

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

  // Coalesce concurrent misses for the same key (Home used to stampede).
  const inflight = inflightBucket();
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await loader();
      map.set(key, { at: Date.now(), value });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}
