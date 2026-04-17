import { Pinecone } from "@pinecone-database/pinecone";
import type { ChunkRecord } from "./types";

const UPSERT_BATCH = 100;
const UPSERT_CONCURRENCY = 4;

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
