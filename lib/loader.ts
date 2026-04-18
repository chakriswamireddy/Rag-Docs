import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import path from "path";

const MAX_CHUNK_SIZE = 800;
const MIN_CHUNK_SIZE = 200;
const TARGET_CHUNK_SIZE = 500;

/**
 * Heuristically detect a section heading from the first line of a chunk.
 * Looks for: numbered headings ("1.2 Billing"), ALL CAPS lines,
 * or short lines that don't end with a period (not a regular sentence).
 */
function detectSection(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "General";
  const first = lines[0];
  const isNumbered = /^(\d+[\.\d]*|[A-Z][\.\d]+)\s+\w/.test(first);
  const isAllCaps =
    first.length > 3 && first === first.toUpperCase() && /[A-Z]/.test(first);
  const isShortTitle = first.length < 60 && !first.endsWith(".");
  if (isNumbered || isAllCaps || isShortTitle) {
    return first.slice(0, 100);
  }
  return "General";
}

/**
 * Semantic chunking: split text by paragraphs, merge small fragments,
 * and split oversized paragraphs by sentences.
 */
function semanticChunk(text: string): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_SIZE) {
      if (buffer) { chunks.push(buffer.trim()); buffer = ""; }
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
    if (
      merged.length > 0 &&
      merged[merged.length - 1].length < MIN_CHUNK_SIZE &&
      merged[merged.length - 1].length + chunk.length + 2 <= MAX_CHUNK_SIZE
    ) {
      merged[merged.length - 1] += "\n\n" + chunk;
    } else if (
      merged.length > 0 &&
      chunk.length < MIN_CHUNK_SIZE &&
      merged[merged.length - 1].length + chunk.length + 2 <= MAX_CHUNK_SIZE
    ) {
      merged[merged.length - 1] += "\n\n" + chunk;
    } else {
      merged.push(chunk);
    }
  }
  return merged.filter(Boolean);
}

export async function loadAndSplit(filePath: string) {
  const loader = new PDFLoader(filePath);
  const docs = await loader.load();

  const uploadedAt = new Date().toISOString();
  const source = path.basename(filePath);

  // Combine all pages' text, then semantic chunk
  const allChunks: { pageContent: string; metadata: Record<string, unknown> }[] = [];

  for (const doc of docs) {
    const pageNum =
      (doc.metadata?.loc as { pageNumber?: number } | undefined)?.pageNumber
      ?? (doc.metadata?.page as number | undefined)
      ?? 1;

    const chunks = semanticChunk(doc.pageContent);
    for (const chunk of chunks) {
      allChunks.push({
        pageContent: chunk,
        metadata: {
          ...doc.metadata,
          source,
          page: pageNum,
          section: detectSection(chunk),
          uploadedAt,
        },
      });
    }
  }

  // Assign global chunkIndex
  return allChunks.map((chunk, index) => ({
    ...chunk,
    metadata: { ...chunk.metadata, chunkIndex: index },
  }));
}