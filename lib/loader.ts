import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import path from "path";

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

export async function loadAndSplit(filePath: string) {
  const loader = new PDFLoader(filePath);
  const docs = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 80,
    separators: ["\n\n", "\n", ". ", " ", ""],
  });

  const splitDocs = await splitter.splitDocuments(docs);

  const uploadedAt = new Date().toISOString();
  const source = path.basename(filePath);

  return splitDocs.map((doc, index) => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      source,
      page: (doc.metadata?.loc as { pageNumber?: number } | undefined)?.pageNumber
        ?? (doc.metadata?.page as number | undefined)
        ?? 1,
      section: detectSection(doc.pageContent),
      chunkIndex: index,
      uploadedAt,
    },
  }));
}