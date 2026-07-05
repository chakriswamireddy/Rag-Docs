import { Pinecone } from "@pinecone-database/pinecone";
import type { ChunkRecord } from "./types";

const UPSERT_BATCH = 100;
const UPSERT_CONCURRENCY = 4;

/**
 * Embedding dimension for @cf/baai/bge-small-en-v1.5 (see shared/embeddings.ts).
 * Every vector we upsert has this length, so the Pinecone index MUST match it.
 */
export const EXPECTED_INDEX_DIM = 384;

function createClient() {
  return new Pinecone({
    apiKey: process.env.PINECONE_API_KEY ?? "",
  });
}

const client = createClient();

export function getPineconeIndex() {
  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error("PINECONE_INDEX_NAME is required");
  }
  return client.index(process.env.PINECONE_INDEX_NAME);
}

/**
 * Cached provisioning promise so the dimension check runs at most once per cold
 * start. Cleared on failure so a later request can retry.
 */
let ensurePromise: Promise<void> | null = null;

async function provisionIndex(): Promise<void> {
  const name = process.env.PINECONE_INDEX_NAME;
  if (!name) throw new Error("PINECONE_INDEX_NAME is required");

  const existing = await client.describeIndex(name).catch(() => null);

  // Correct dimension already — nothing to do (the common, cached-forever path).
  if (existing?.dimension === EXPECTED_INDEX_DIM) return;

  // Reuse the existing cloud/region/metric when present; otherwise default to a
  // serverless index on AWS us-east-1 with cosine similarity.
  const metric = (existing?.metric ?? "cosine") as
    | "cosine"
    | "euclidean"
    | "dotproduct";
  const existingServerless =
    existing?.spec && "serverless" in existing.spec
      ? existing.spec.serverless
      : undefined;
  const cloud = (existingServerless?.cloud ?? "aws") as "aws" | "gcp" | "azure";
  const region = existingServerless?.region ?? "us-east-1";

  if (existing) {
    // The index is the wrong dimension. It cannot hold any usable vectors (every
    // upsert of a 384-dim vector into it fails), so recreating it loses no data.
    await client.deleteIndex(name);
    // Wait for the name to be released before recreating.
    for (let i = 0; i < 30; i++) {
      const list = await client.listIndexes();
      if (!list.indexes?.some((idx) => idx.name === name)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await client.createIndex({
    name,
    dimension: EXPECTED_INDEX_DIM,
    metric,
    spec: { serverless: { cloud, region } },
    waitUntilReady: true,
  });
}

/**
 * Ensure the Pinecone index exists at the correct embedding dimension, creating
 * or recreating it if necessary. Safe to call before every indexing run — the
 * result is memoized per process so only the first call does real work.
 *
 * This self-heals the "Vector dimension 384 does not match the dimension of the
 * index 1024" failure without any manual admin step.
 */
export function ensurePineconeIndex(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = provisionIndex().catch((err) => {
      ensurePromise = null; // allow a later request to retry
      throw err;
    });
  }
  return ensurePromise;
}

/** Forget the cached provisioning result so the next call re-checks the index. */
export function resetEnsuredIndex(): void {
  ensurePromise = null;
}

export async function namespaceVectorCount(namespace: string): Promise<number> {
  const stats = await getPineconeIndex().describeIndexStats();
  return stats.namespaces?.[namespace]?.recordCount ?? 0;
}

export async function upsertChunkRecords(records: ChunkRecord[], namespace: string) {
  const ns = getPineconeIndex().namespace(namespace);
  const batches: ChunkRecord[][] = [];
  for (let i = 0; i < records.length; i += UPSERT_BATCH) {
    batches.push(records.slice(i, i + UPSERT_BATCH));
  }

  for (let i = 0; i < batches.length; i += UPSERT_CONCURRENCY) {
    const group = batches.slice(i, i + UPSERT_CONCURRENCY);
    await Promise.all(group.map((batch) => ns.upsert({ records: batch })));
  }
}
