/**
 * Synchronous, in-app PDF indexing.
 *
 * The upload route already holds the PDF bytes in memory and caps uploads at a
 * few MB, so we parse → chunk → embed → upsert → persist right there, instead of
 * dispatching to the external Cloudflare Worker and waiting on a webhook callback
 * (which requires the Worker to be deployed and wired back to this app).
 *
 * The chunk + metadata shape mirrors the Worker's so retrieval is identical:
 *   - Pinecone namespace: `tenant_${tenantId}` for tenant users, else the docId
 *   - vector id / embeddingId: `${docId}-${i}`
 *   - metadata: { docId, page, chunkIndex, text, source, uploadedAt, tenantId? }
 */
import { extractText } from "unpdf";
import { embedTexts } from "@/shared/embeddings";
import { index } from "@/lib/pinecone";
import { ensurePineconeIndex, resetPineconeIndexCache } from "@/shared/pinecone";
import { storeChunks, updateDocumentStatus } from "@/lib/services/document.service";

const MAX_CHUNK_SIZE = 800;
const MIN_CHUNK_SIZE = 200;
const TARGET_CHUNK_SIZE = 500;
const UPSERT_BATCH = 100;

function detectSection(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "General";
  const first = lines[0];
  const isNumbered = /^(\d+[\.\d]*|[A-Z][\.\d]+)\s+\w/.test(first);
  const isAllCaps =
    first.length > 3 && first === first.toUpperCase() && /[A-Z]/.test(first);
  const isShortTitle = first.length < 60 && !first.endsWith(".");
  return isNumbered || isAllCaps || isShortTitle ? first.slice(0, 100) : "General";
}

/** Split text by paragraphs, merging small fragments and splitting oversized ones. */
function semanticChunk(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_SIZE) {
      if (buffer) {
        chunks.push(buffer.trim());
        buffer = "";
      }
      const sentences = para.split(/(?<=[.!?])\s+/);
      let sentBuf = "";
      for (const sent of sentences) {
        if (sentBuf.length + sent.length + 1 > TARGET_CHUNK_SIZE && sentBuf) {
          chunks.push(sentBuf.trim());
          sentBuf = "";
        }
        sentBuf += (sentBuf ? " " : "") + sent;
      }
      if (sentBuf) chunks.push(sentBuf.trim());
    } else if (buffer.length + para.length + 2 > TARGET_CHUNK_SIZE) {
      if (buffer) chunks.push(buffer.trim());
      buffer = para;
    } else {
      buffer += (buffer ? "\n\n" : "") + para;
    }
  }
  if (buffer) chunks.push(buffer.trim());

  const merged: string[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      (prev.length < MIN_CHUNK_SIZE || chunk.length < MIN_CHUNK_SIZE) &&
      prev.length + chunk.length + 2 <= MAX_CHUNK_SIZE
    ) {
      merged[merged.length - 1] = prev + "\n\n" + chunk;
    } else {
      merged.push(chunk);
    }
  }
  return merged.filter(Boolean);
}

type Chunk = { text: string; page: number; section: string };

/** Extract per-page text from a PDF buffer and split into semantic chunks. */
async function extractChunks(buffer: Buffer): Promise<Chunk[]> {
  const { text } = await extractText(new Uint8Array(buffer), { mergePages: false });
  const pages: string[] = Array.isArray(text) ? text : [text];

  const result: Chunk[] = [];
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = (pages[pageIdx] ?? "").trim();
    if (!pageText) continue;
    for (const chunk of semanticChunk(pageText)) {
      result.push({ text: chunk, page: pageIdx + 1, section: detectSection(chunk) });
    }
  }
  return result;
}

export type IndexResult =
  | { ok: true; totalChunks: number }
  | { ok: false; error: string };

/**
 * Parse, embed and index a PDF that has already been persisted to storage and
 * recorded in the database. Updates the document's status to "indexed" (or
 * "failed" with a reason). Returns the outcome so the caller can surface it.
 */
export async function indexPdfBuffer(params: {
  buffer: Buffer;
  docId: string; // SHA-256 file hash (Pinecone metadata.docId)
  documentId: string; // documents.id (uuid)
  fileName: string;
  tenantId: string | null;
  uploadedAt: string;
}): Promise<IndexResult> {
  const { buffer, docId, documentId, fileName, tenantId, uploadedAt } = params;

  try {
    await ensurePineconeIndex();

    const chunks = await extractChunks(buffer);
    if (chunks.length === 0) {
      const error =
        "No extractable text found in the PDF (it may be scanned images or a non-PDF renamed to .pdf).";
      await updateDocumentStatus(docId, "failed", { errorMessage: error });
      return { ok: false, error };
    }

    const embeddings = await embedTexts(chunks.map((c) => c.text));

    const namespace = tenantId ? `tenant_${tenantId}` : docId;
    const ns = index.namespace(namespace);
    const records = chunks.map((chunk, i) => ({
      id: `${docId}-${i}`,
      values: embeddings[i],
      metadata: {
        docId,
        page: chunk.page,
        chunkIndex: i,
        text: chunk.text,
        source: fileName,
        uploadedAt,
        ...(tenantId ? { tenantId } : {}),
      },
    }));
    try {
      for (let i = 0; i < records.length; i += UPSERT_BATCH) {
        await ns.upsert({ records: records.slice(i, i + UPSERT_BATCH) });
      }
    } catch (upsertErr) {
      const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
      if (msg.includes("dimension")) {
        resetPineconeIndexCache();
        const error = "Vector index was repaired — please retry the upload in ~30s.";
        await updateDocumentStatus(docId, "failed", { errorMessage: error });
        return { ok: false, error };
      }
      throw upsertErr;
    }

    await storeChunks(
      documentId,
      tenantId,
      chunks.map((chunk, i) => ({
        chunkIndex: i,
        content: chunk.text,
        sectionTitle: chunk.section,
        pageNumber: chunk.page,
        embeddingId: `${docId}-${i}`,
      }))
    );

    await updateDocumentStatus(docId, "indexed", { totalChunks: chunks.length });
    return { ok: true, totalChunks: chunks.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await updateDocumentStatus(docId, "failed", { errorMessage: error });
    return { ok: false, error };
  }
}
