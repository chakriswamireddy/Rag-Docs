import { getDb } from "@/lib/db";
import { documents, documentChunks } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

export async function createDocument(params: {
  tenantId: string | null;
  userId: string | null;
  fileName: string;
  fileUrl: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
}) {
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      fileHash: params.fileHash,
      fileSize: params.fileSize,
      mimeType: params.mimeType,
      status: "uploaded",
    })
    .returning();
  return doc;
}

export async function updateDocumentStatus(
  docHash: string,
  status: string,
  extra?: { errorMessage?: string; totalChunks?: number }
) {
  const db = getDb();
  const [updated] = await db
    .update(documents)
    .set({
      status,
      ...(extra?.errorMessage && { errorMessage: extra.errorMessage }),
      ...(extra?.totalChunks !== undefined && { totalChunks: extra.totalChunks }),
      updatedAt: new Date(),
    })
    .where(eq(documents.fileHash, docHash))
    .returning();
  return updated ?? null;
}

export async function getDocumentByHash(hash: string) {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.fileHash, hash))
    .limit(1);
  return doc ?? null;
}

export async function listDocuments(tenantId: string, limit = 50, offset = 0) {
  const db = getDb();
  return db
    .select()
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * List the documents a principal can access:
 *  - tenant users: scoped to their tenant
 *  - tenant-less users (e.g. the test account): scoped to their own uploads
 */
export async function listAccessibleDocuments(
  scope: { tenantId: string | null; userId: string | null },
  limit = 200,
  offset = 0
) {
  const db = getDb();
  const cond = scope.tenantId
    ? eq(documents.tenantId, scope.tenantId)
    : scope.userId
      ? eq(documents.userId, scope.userId)
      : null;
  if (!cond) return [];
  return db
    .select()
    .from(documents)
    .where(cond)
    .orderBy(desc(documents.createdAt))
    .limit(limit)
    .offset(offset);
}

/** Fetch chunk rows for a set of document IDs (used to build a scoped BM25 corpus). */
export async function getChunksForDocumentIds(documentIds: string[], limit = 6000) {
  if (documentIds.length === 0) return [];
  const db = getDb();
  return db
    .select({
      documentId: documentChunks.documentId,
      chunkIndex: documentChunks.chunkIndex,
      content: documentChunks.content,
      sectionTitle: documentChunks.sectionTitle,
      pageNumber: documentChunks.pageNumber,
    })
    .from(documentChunks)
    .where(inArray(documentChunks.documentId, documentIds))
    .limit(limit);
}

export async function getDocumentWithChunks(docId: string) {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, docId))
    .limit(1);

  if (!doc) return null;

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, docId))
    .orderBy(documentChunks.chunkIndex);

  return { ...doc, chunks };
}

export async function storeChunks(
  documentId: string,
  tenantId: string | null,
  chunks: {
    chunkIndex: number;
    content: string;
    sectionTitle: string;
    pageNumber: number;
    embeddingId: string;
  }[]
) {
  if (chunks.length === 0) return;
  const db = getDb();
  await db.insert(documentChunks).values(
    chunks.map((c) => ({
      tenantId,
      documentId,
      chunkIndex: c.chunkIndex,
      content: c.content,
      sectionTitle: c.sectionTitle,
      pageNumber: c.pageNumber,
      embeddingId: c.embeddingId,
    }))
  );
}

export async function deleteDocument(docId: string, tenantId: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(documents)
    .where(and(eq(documents.id, docId), eq(documents.tenantId, tenantId)))
    .returning({ id: documents.id });
  return deleted ?? null;
}
