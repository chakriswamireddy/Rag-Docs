/**
 * Pinecone REST API client for the Cloudflare Worker.
 *
 * Uses the data-plane host directly to avoid the full Node SDK.
 * All vectors for a single document are stored in namespace = docId.
 *
 * Required env:
 *   PINECONE_API_KEY     – API key
 *   PINECONE_INDEX_HOST  – e.g. https://my-index-abc123.svc.us-east1-gcp.pinecone.io
 */

import type { Env } from "./index";

export interface PineconeVector {
  id: string;
  values: number[];
  metadata: Record<string, unknown>;
}

const UPSERT_BATCH = 100;

/**
 * Check whether a namespace already has vectors (idempotency guard).
 * Returns true if the namespace has at least one vector.
 */
export async function isAlreadyIndexed(namespace: string, env: Env): Promise<boolean> {
  const res = await fetch(
    `${env.PINECONE_INDEX_HOST}/describe_index_stats`,
    {
      method: "POST",
      headers: {
        "Api-Key": env.PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) return false; // fail open — let upsert proceed

  const data = (await res.json()) as {
    namespaces?: Record<string, { vectorCount?: number }>;
  };

  return (data.namespaces?.[namespace]?.vectorCount ?? 0) > 0;
}

/**
 * Upsert vectors into Pinecone in batches of 100.
 * @param vectors   List of vectors with metadata.
 * @param namespace Typically the docId.
 */
export async function upsertToPinecone(
  vectors: PineconeVector[],
  namespace: string,
  env: Env
): Promise<void> {
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
    const batch = vectors.slice(i, i + UPSERT_BATCH);

    const res = await fetch(`${env.PINECONE_INDEX_HOST}/vectors/upsert`, {
      method: "POST",
      headers: {
        "Api-Key": env.PINECONE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ vectors: batch, namespace }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Pinecone upsert failed (${res.status}): ${detail}`);
    }
  }
}
