/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key (e.g., tenant or IP).
 * Expired entries are lazily cleaned on access.
 */

const windows = new Map<string, number[]>();

/** Clean up old entries beyond the window. */
function prune(key: string, windowMs: number) {
  const timestamps = windows.get(key);
  if (!timestamps) return;
  const cutoff = Date.now() - windowMs;
  const pruned = timestamps.filter((t) => t > cutoff);
  if (pruned.length === 0) {
    windows.delete(key);
  } else {
    windows.set(key, pruned);
  }
}

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param key       Unique identifier (e.g., tenantId, IP)
 * @param limit     Max requests per window
 * @param windowMs  Window duration in milliseconds
 * @returns Object with `allowed` boolean and `retryAfterMs` if blocked
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  prune(key, windowMs);

  const timestamps = windows.get(key) ?? [];
  const now = Date.now();

  if (timestamps.length >= limit) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  timestamps.push(now);
  windows.set(key, timestamps);

  return {
    allowed: true,
    remaining: limit - timestamps.length,
  };
}

// ─── Pre-configured rate limiters ──────────────────────────────────────────

/** 100 queries per minute per tenant. */
export function checkQueryLimit(tenantId: string) {
  return rateLimit(`query:${tenantId}`, 100, 60_000);
}

/** 20 uploads per hour per tenant. */
export function checkUploadLimit(tenantId: string) {
  return rateLimit(`upload:${tenantId}`, 20, 3_600_000);
}

/** 10 registration attempts per hour per IP. */
export function checkRegistrationLimit(ip: string) {
  return rateLimit(`register:${ip}`, 10, 3_600_000);
}
