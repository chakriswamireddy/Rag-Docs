import { Pinecone } from "@pinecone-database/pinecone";
import type { ChunkRecord } from "./types";

const UPSERT_BATCH = 100;
const UPSERT_CONCURRENCY = 4;
const EXPECTED_DIM = 384;

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

let ensurePromise: Promise<void> | null = null;

/**
 * Makes sure the Pinecone index exists at EXPECTED_DIM (384, matching
 * @cf/baai/bge-small-en-v1.5). If it was created at a different dimension
 * (e.g. a stray manual 1024 index), delete + recreate it. Cached per cold
 * start so only the first call pays the describeIndex round-trip; cleared
 * on failure so the next request retries.
 */
export function ensurePineconeIndex(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = doEnsurePineconeIndex().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

/** Force the next ensurePineconeIndex() call to re-check, even if cached. */
export function resetPineconeIndexCache() {
  ensurePromise = null;
}

async function doEnsurePineconeIndex(): Promise<void> {
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!indexName) {
    throw new Error("PINECONE_INDEX_NAME is required");
  }

  const existing = await client.describeIndex(indexName).catch(() => null);
  if (existing?.dimension === EXPECTED_DIM) {
    return;
  }

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
    await client.deleteIndex(indexName);
    // Poll until the name is released before recreating.
    for (let i = 0; i < 30; i++) {
      const stillThere = await client.describeIndex(indexName).catch(() => null);
      if (!stillThere) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  await client.createIndex({
    name: indexName,
    dimension: EXPECTED_DIM,
    metric,
    spec: { serverless: { cloud, region } },
    waitUntilReady: true,
  });
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
