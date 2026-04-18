import { getDb } from "@/lib/db";
import {
  queries,
  queryRetrievals,
  responses,
  responseSources,
  documentChunks,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function logQuery(params: {
  tenantId: string | null;
  userId: string | null;
  originalQuery: string;
  rewrittenQuery: string;
  queryType: string;
  topK: number;
  reranked: boolean;
}) {
  const db = getDb();
  const [query] = await db
    .insert(queries)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      originalQuery: params.originalQuery,
      rewrittenQuery: params.rewrittenQuery,
      queryType: params.queryType,
      topK: params.topK,
      reranked: params.reranked,
    })
    .returning();
  return query;
}

export async function logRetrievals(
  queryId: string,
  retrievals: {
    embeddingId: string;
    score: number;
    rerankScore?: number;
    rank: number;
  }[]
) {
  if (retrievals.length === 0) return;
  const db = getDb();

  // Look up chunk IDs by embedding_id
  for (const r of retrievals) {
    const [chunk] = await db
      .select({ id: documentChunks.id })
      .from(documentChunks)
      .where(eq(documentChunks.embeddingId, r.embeddingId))
      .limit(1);

    await db.insert(queryRetrievals).values({
      queryId,
      chunkId: chunk?.id ?? null,
      score: r.score,
      rerankScore: r.rerankScore ?? null,
      rank: r.rank,
    });
  }
}

export async function logResponse(params: {
  queryId: string;
  answer: string | null;
  confidenceScore: number;
  tokenUsage: number;
  latencyMs: number;
}) {
  const db = getDb();
  const [response] = await db
    .insert(responses)
    .values({
      queryId: params.queryId,
      answer: params.answer,
      confidenceScore: params.confidenceScore,
      tokenUsage: params.tokenUsage,
      latencyMs: params.latencyMs,
    })
    .returning();
  return response;
}

export async function logCitations(
  responseId: string,
  citations: { embeddingId: string; documentId?: string }[]
) {
  if (citations.length === 0) return;
  const db = getDb();

  for (const c of citations) {
    const [chunk] = await db
      .select({ id: documentChunks.id, documentId: documentChunks.documentId })
      .from(documentChunks)
      .where(eq(documentChunks.embeddingId, c.embeddingId))
      .limit(1);

    if (chunk) {
      await db.insert(responseSources).values({
        responseId,
        chunkId: chunk.id,
        documentId: chunk.documentId,
      });
    }
  }
}

export async function getQueryHistory(
  tenantId: string,
  limit = 50,
  offset = 0
) {
  const db = getDb();
  return db
    .select()
    .from(queries)
    .where(eq(queries.tenantId, tenantId))
    .orderBy(desc(queries.createdAt))
    .limit(limit)
    .offset(offset);
}
