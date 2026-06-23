/**
 * Resolves the retrieval scope for a query.
 *
 * Turns the authenticated principal (+ an optional document selection) into:
 *   - `docIds`: the Pinecone document hashes to restrict dense search to
 *   - `bm25`:   a fresh, in-memory BM25 index built from those documents'
 *               chunks in Postgres (no stale on-disk corpus)
 *
 * This is what makes multi-document RAG correct: instead of fanning out across
 * every namespace ever indexed, we scope to exactly the documents the user owns
 * (or explicitly selected), for both the dense and sparse halves of retrieval.
 */
import { Document } from "langchain/document";
import {
  listAccessibleDocuments,
  getChunksForDocumentIds,
} from "./services/document.service";
import { createBM25Index, type BM25Index } from "./bm25-store";

export type ResolvedScope = {
  /** Pinecone document hashes (metadata.docId) to restrict retrieval to. */
  docIds: string[];
  /** Request-scoped sparse index built from the selected documents' chunks. */
  bm25: BM25Index;
};

export async function resolveQueryScope(
  principal: { tenantId: string | null; userId: string | null },
  requestedDocumentIds?: string[] | null
): Promise<ResolvedScope> {
  const accessible = await listAccessibleDocuments(principal);

  // Only indexed documents are queryable; intersect with the user's selection.
  let docs = accessible.filter((d) => d.status === "indexed" && d.fileHash);
  if (requestedDocumentIds && requestedDocumentIds.length > 0) {
    const wanted = new Set(requestedDocumentIds);
    docs = docs.filter((d) => wanted.has(d.id));
  }

  const docIds = docs.map((d) => d.fileHash as string);
  const byDocId = new Map(docs.map((d) => [d.id, d]));

  const chunkRows = docs.length
    ? await getChunksForDocumentIds(docs.map((d) => d.id))
    : [];

  const bm25Docs = chunkRows.map((c) => {
    const parent = c.documentId ? byDocId.get(c.documentId) : undefined;
    return new Document({
      pageContent: c.content ?? "",
      metadata: {
        docId: parent?.fileHash ?? "",
        source: parent?.fileName ?? "Unknown",
        chunkIndex: c.chunkIndex,
        page: c.pageNumber ?? 0,
        section: c.sectionTitle ?? "General",
      },
    });
  });

  return { docIds, bm25: createBM25Index(bm25Docs) };
}
