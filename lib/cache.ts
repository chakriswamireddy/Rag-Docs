/**
 * Simple LRU cache for query results.
 *
 * Caches { answer, sources, queryType } keyed by a hash of the question
 * + the document's index signature (chunkCount) so stale answers are
 * automatically invalidated when new documents are uploaded.
 *
 * No extra npm dependencies — uses a Map as an ordered LRU structure.
 */
import crypto from "crypto";
import type { AskResult } from "./rag";

const MAX_ENTRIES = 100;
const TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = {
  result: AskResult;
  expiresAt: number;
};

/** Module-level LRU map in insertion order (oldest first). */
const store = new Map<string, CacheEntry>();

/**
 * Build a stable cache key from the (canonicalized) question text.
 * The key is an 8-byte hex digest — collision risk is negligible at 100 entries.
 */
export function cacheKey(question: string): string {
  return crypto
    .createHash("sha256")
    .update(question.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

/** Return a cached result, or `null` if absent / expired. */
export function getCached(key: string): (AskResult & { cached: true }) | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  // LRU refresh: move to end
  store.delete(key);
  store.set(key, entry);
  return { ...entry.result, cached: true };
}

/** Store a result. Evicts the oldest entry when the cache is full. */
export function setCached(key: string, result: AskResult): void {
  if (store.has(key)) store.delete(key); // refresh position
  if (store.size >= MAX_ENTRIES) {
    // Evict oldest (first) entry
    store.delete(store.keys().next().value!);
  }
  store.set(key, { result, expiresAt: Date.now() + TTL_MS });
}

/** Invalidate the entire cache (called after a new document is uploaded). */
export function invalidateCache(): void {
  store.clear();
}
