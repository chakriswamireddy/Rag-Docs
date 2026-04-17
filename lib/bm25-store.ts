/**
 * BM25 sparse retrieval index.
 * Stores term-frequency data for every chunk so keyword/exact-match queries
 * (IDs, names, numbers) find results that pure vector search may miss.
 *
 * Files written to disk:
 *   data/bm25_index.json   – per-doc term-frequencies, DF table, stats
 *   data/bm25_corpus.json  – full document content + metadata
 */
import { Document } from "langchain/document";
import fs from "fs";
import path from "path";

const K1 = 1.5;
const B = 0.75;

const BM25_INDEX_PATH = path.join(process.cwd(), "data", "bm25_index.json");
const BM25_CORPUS_PATH = path.join(process.cwd(), "data", "bm25_corpus.json");

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z0-9]+\b/g) ?? [];
}

type DocRecord = {
  id: number;
  termFreqs: Record<string, number>;
  length: number;
};

type SerializedIndex = {
  docs: DocRecord[];
  df: Record<string, number>;
  avgLength: number;
  docCount: number;
};

let cachedIndex: SerializedIndex | null = null;
let cachedCorpus: Document[] | null = null;

/** Build the BM25 index from the given documents and persist it to disk. */
export function buildBM25Index(docs: Document[]): void {
  const records: DocRecord[] = [];
  const df: Record<string, number> = {};
  let totalLength = 0;

  for (let i = 0; i < docs.length; i++) {
    const tokens = tokenize(docs[i].pageContent);
    const termFreqs: Record<string, number> = {};
    for (const token of tokens) {
      termFreqs[token] = (termFreqs[token] ?? 0) + 1;
    }
    for (const term of Object.keys(termFreqs)) {
      df[term] = (df[term] ?? 0) + 1;
    }
    totalLength += tokens.length;
    records.push({ id: i, termFreqs, length: tokens.length });
  }

  cachedIndex = {
    docs: records,
    df,
    avgLength: records.length > 0 ? totalLength / records.length : 0,
    docCount: records.length,
  };
  cachedCorpus = docs;

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(BM25_INDEX_PATH, JSON.stringify(cachedIndex));
  fs.writeFileSync(
    BM25_CORPUS_PATH,
    JSON.stringify(
      docs.map((d) => ({ pageContent: d.pageContent, metadata: d.metadata }))
    )
  );
}

/**
 * Load the BM25 index from disk into memory (idempotent — skips if already loaded).
 * Called once per process before the first search.
 */
export function loadBM25Index(): void {
  if (cachedIndex && cachedCorpus) return;
  try {
    if (fs.existsSync(BM25_INDEX_PATH) && fs.existsSync(BM25_CORPUS_PATH)) {
      cachedIndex = JSON.parse(
        fs.readFileSync(BM25_INDEX_PATH, "utf-8")
      ) as SerializedIndex;
      const raw = JSON.parse(fs.readFileSync(BM25_CORPUS_PATH, "utf-8")) as Array<{
        pageContent: string;
        metadata: Record<string, unknown>;
      }>;
      cachedCorpus = raw.map(
        (d) => new Document({ pageContent: d.pageContent, metadata: d.metadata })
      );
    }
  } catch {
    // Index not yet built — first run before any upload. Fine to ignore.
  }
}

export type BM25Result = {
  doc: Document;
  score: number;
  corpusIndex: number;
};

/** Score all documents against the query and return the top-k by BM25 score. */
export function searchBM25(query: string, k: number): BM25Result[] {
  if (!cachedIndex || !cachedCorpus) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const { docs, df, avgLength, docCount } = cachedIndex;
  const results: Array<{ corpusIndex: number; score: number }> = [];

  for (const record of docs) {
    let score = 0;
    for (const token of queryTokens) {
      const tf = record.termFreqs[token] ?? 0;
      if (tf === 0) continue;
      const docFreq = df[token] ?? 0;
      const idf = Math.log(
        (docCount - docFreq + 0.5) / (docFreq + 0.5) + 1
      );
      const denom =
        tf + K1 * (1 - B + B * (record.length / (avgLength || 1)));
      score += idf * ((tf * (K1 + 1)) / denom);
    }
    if (score > 0) results.push({ corpusIndex: record.id, score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, k).map(({ corpusIndex, score }) => ({
    doc: cachedCorpus![corpusIndex],
    score,
    corpusIndex,
  }));
}
