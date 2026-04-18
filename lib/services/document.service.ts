import { getDb } from "@/lib/db";
import { documents, documentChunks } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

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
