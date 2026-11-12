import "server-only";

function isResourceExhausted(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: number | string; message?: string };
  if (e.code === 8 || e.code === "RESOURCE_EXHAUSTED") return true;
  const msg = String(e.message ?? err);
  return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(msg);
}

/**
 * Retry transient Firestore quota / rate-limit errors with exponential backoff.
 */
export async function withFirestoreRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseMs?: number },
): Promise<T> {
  const attempts = opts?.attempts ?? 4;
  const baseMs = opts?.baseMs ?? 200;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isResourceExhausted(err) || i === attempts - 1) throw err;
      const wait = baseMs * 2 ** i + Math.floor(Math.random() * 100);
      console.warn(
        `[firestore-retry] ${label} RESOURCE_EXHAUSTED; retry ${i + 1}/${attempts - 1} in ${wait}ms`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}
