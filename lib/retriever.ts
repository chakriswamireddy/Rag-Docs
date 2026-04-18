/**
 * Hybrid retriever: combines Pinecone dense search (semantic similarity) with
 * BM25 sparse search (keyword / exact-match) for best-of-both-worlds recall.
 *
 * Scoring formula:
 *   final = α * norm(denseScore) + (1 – α) * norm(bm25Score)
 *
 * Pinecone returns cosine similarity scores (higher = more similar).
 */
import { embedQuery } from "./embeddings";
import { index } from "./pinecone";
import { loadBM25Index, searchBM25 } from "./bm25-store";
import { Document } from "langchain/document";

/** Blend weight for the dense signal. 0.6 = slightly prefer semantic match. */
const ALPHA = 0.6;

/** Fallback single namespace when index has no per-doc namespaces yet. */
const DEFAULT_NAMESPACE = process.env.PINECONE_NAMESPACE ?? "default";

function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 1);
  return scores.map((s) => (s - min) / (max - min));
}

export type ScoredDocument = { doc: Document; score: number };

/**
 * Retrieve the top-k most relevant chunks using hybrid Pinecone + BM25 search.
 * @param query    The user's question (already rewritten if multi-turn).
 * @param k        Maximum results to return (default 20; callers can slice down).
 * @param tenantId Optional tenant ID to scope the search to a specific tenant namespace.
 */
export async function hybridRetrieve(
  query: string,
  k: number = 20,
  tenantId?: string | null
): Promise<ScoredDocument[]> {
  // Ensure BM25 is loaded (idempotent, synchronous read on warm paths)
  loadBM25Index();

  // Dense retrieval via Pinecone — query across all indexed namespaces
  const queryEmbedding = await embedQuery(query);

  let searchNs: string[];

  if (tenantId) {
    // Tenant-scoped: only search the tenant's namespace
    searchNs = [`tenant_${tenantId}`];
  } else {
    // Legacy: discover all namespaces
    const stats = await index.describeIndexStats();
    const namespaces = Object.keys(stats.namespaces ?? {});
    searchNs = namespaces.length > 0 ? namespaces : [DEFAULT_NAMESPACE];
  }

  // Distribute topK evenly across namespaces; at least 5 per namespace
  const perNsK = Math.max(5, Math.ceil(k / searchNs.length));
  const nsResults = await Promise.all(
    searchNs.map((ns) =>
      index.namespace(ns).query({
        vector: queryEmbedding,
        topK: perNsK,
        includeMetadata: true,
      })
    )
  );
  const pineconeRes = { matches: nsResults.flatMap((r) => r.matches ?? []) };

  // Sparse retrieval: BM25Result[] — higher score means MORE relevant
  const sparseRaw = searchBM25(query, k);

  // ── Unify into a single map keyed by chunkIndex (stable across both indexes) ──
  type Entry = { doc: Document; denseScore?: number; sparseScore?: number };
  const map = new Map<string, Entry>();

  for (const match of pineconeRes.matches ?? []) {
    const meta = (match.metadata ?? {}) as Record<string, unknown>;
    const doc = new Document({
      pageContent: String(meta.text ?? ""),
      metadata: Object.fromEntries(
        Object.entries(meta).filter(([k]) => k !== "text")
      ),
    });
    const key = chunkKey(doc);
    map.set(key, { doc, denseScore: match.score ?? 0 });
  }

  for (const { doc, score } of sparseRaw) {
    const key = chunkKey(doc);
    const existing = map.get(key);
    if (existing) {
      existing.sparseScore = score;
    } else {
      map.set(key, { doc, sparseScore: score });
    }
  }

  const entries = Array.from(map.values());

  const normDense = normalizeScores(entries.map((e) => e.denseScore ?? 0));
  const normSparse = normalizeScores(entries.map((e) => e.sparseScore ?? 0));

  const scored: ScoredDocument[] = entries.map((e, i) => ({
    doc: e.doc,
    score: ALPHA * normDense[i] + (1 - ALPHA) * normSparse[i],
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

/** Stable unique key for a chunk — prefers chunkIndex, falls back to content hash. */
function chunkKey(doc: Document): string {
  const docId = doc.metadata?.docId !== undefined ? String(doc.metadata.docId) : "unknown";
  const ci = doc.metadata?.chunkIndex;
  if (ci !== undefined && ci !== null) return `${docId}:${String(ci)}`;
  // Fallback: page + first 40 chars (handles legacy indexes without chunkIndex)
  return `${docId}:${doc.metadata?.page ?? 0}-${doc.pageContent.slice(0, 40)}`;
}
