/**
 * PDF text extractor and chunker for the Cloudflare Worker.
 *
 * Uses `unpdf` — a pdfjs-dist wrapper built for edge/serverless environments.
 * No canvas, no Node.js streams.
 *
 * Semantic chunking: splits by paragraphs first, then by sentences if needed.
 * Merges small adjacent chunks to avoid tiny fragments.
 */

import { extractText } from "unpdf";

const MAX_CHUNK_SIZE = 800;
const MIN_CHUNK_SIZE = 200;
const TARGET_CHUNK_SIZE = 500;

export interface TextChunk {
  text: string;
  page: number;
}

/** Heuristically detect a section heading from the first line of a chunk. */
function detectSection(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "General";
  const first = lines[0];
  const isNumbered = /^(\d+[\.\d]*|[A-Z][\.\d]+)\s+\w/.test(first);
  const isAllCaps =
    first.length > 3 && first === first.toUpperCase() && /[A-Z]/.test(first);
  const isShortTitle = first.length < 60 && !first.endsWith(".");
  return isNumbered || isAllCaps || isShortTitle ? first.slice(0, 100) : "General";
}

/**
 * Semantic chunking: split text by paragraphs, then merge small fragments
 * and split oversized paragraphs by sentences.
 */
function semanticChunk(text: string): string[] {
  // Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_SIZE) {
      // Flush buffer first
      if (buffer) {
        chunks.push(buffer.trim());
        buffer = "";
      }
      // Split oversized paragraph by sentences
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
      // Buffer would exceed target — flush and start new
      if (buffer) chunks.push(buffer.trim());
      buffer = para;
    } else {
      // Accumulate into buffer
      buffer += (buffer ? "\n\n" : "") + para;
    }
  }

  if (buffer) chunks.push(buffer.trim());

  // Merge any remaining small chunks with their neighbor
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

/**
 * Extract text from a PDF ArrayBuffer, split into semantic chunks,
 * and return structured chunk objects with page and section metadata.
 */
export async function extractTextChunks(
  pdfBuffer: ArrayBuffer,
  fileName: string,
  docId: string,
  uploadedAt: string
): Promise<(TextChunk & { section: string; source: string; uploadedAt: string })[]> {
  const { text } = await extractText(new Uint8Array(pdfBuffer), {
    mergePages: false,
  });

  // text is string[] when mergePages = false (one entry per page)
  const pages: string[] = Array.isArray(text) ? (text as string[]) : [text as string];

  const result: (TextChunk & { section: string; source: string; uploadedAt: string })[] = [];

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageText = pages[pageIdx].trim();
    if (!pageText) continue;

    const pageChunks = semanticChunk(pageText);
    for (const chunk of pageChunks) {
      result.push({
        text: chunk,
        page: pageIdx + 1,
        section: detectSection(chunk),
        source: fileName,
        uploadedAt,
      });
    }
  }

  return result;
}
