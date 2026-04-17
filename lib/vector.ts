import { Document } from "langchain/document";
import { buildBM25Index } from "./bm25-store";
import { index } from "./pinecone";
import { embedTexts } from "./embeddings";
import type { RecordMetadata } from "@pinecone-database/pinecone";

/** CF Workers AI batch limit per request */
const EMBED_BATCH = 50;
/** Pinecone recommended upsert batch size */
const UPSERT_BATCH = 100;

export async function createVectorStore(
  docs: Document[],
  namespace: string
): Promise<void> {
  // Build BM25 sparse index (for hybrid retrieval on the Next.js side)
  buildBM25Index(docs);

  // Batch-embed all chunks to minimise round trips
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < docs.length; i += EMBED_BATCH) {
    const texts = docs.slice(i, i + EMBED_BATCH).map((d) => d.pageContent);
    const vecs = await embedTexts(texts);
    allEmbeddings.push(...vecs);
  }

  const vectors = docs.map((doc, i) => ({
    id: `${doc.metadata?.source ?? "doc"}-${doc.metadata?.chunkIndex ?? i}`,
    values: allEmbeddings[i],
    metadata: {
      text: doc.pageContent,
      ...(doc.metadata as RecordMetadata),
    },
  }));

  // Upsert in batches of ≤100 (Pinecone recommendation)
  for (let start = 0; start < vectors.length; start += UPSERT_BATCH) {
    await index.namespace(namespace).upsert({ records: vectors.slice(start, start + UPSERT_BATCH) });
  }
}