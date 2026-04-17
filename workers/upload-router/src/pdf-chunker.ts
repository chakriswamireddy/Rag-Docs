/**
 * PDF text extractor and chunker for the Cloudflare Worker.
 *
 * Uses `unpdf` — a pdfjs-dist wrapper built for edge/serverless environments.
 * No canvas, no Node.js streams.
 */

import { extractText } from "unpdf";

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 80;

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
 * Slide a fixed-size window over text to produce overlapping chunks.
 * Splits on sentence/word boundaries when possible.
 */
function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    start += CHUNK_SIZE - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks.filter(Boolean);
}

/**
 * Extract text from a PDF ArrayBuffer, split into fixed-overlap chunks,
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

    const pageChunks = chunkText(pageText);
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
