/**
 * LLM-based re-ranker.
 *
 * Takes the top-N chunks returned by hybridRetrieve, sends them to a fast
 * Groq model with a scoring prompt, and returns the top-K sorted by
 * relevance score.  This is cheaper than a cross-encoder and requires no
 * additional dependencies.
 *
 * Swap strategy: replace the `scoreChunks` implementation with a
 * cross-encoder (Xenova/ms-marco-MiniLM-L-6-v2) for higher accuracy once
 * that model is downloaded via `scripts/download-model.mjs`.
 */
import Groq from "groq-sdk";
import type { ScoredDocument } from "./retriever";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

/** Fast model for re-ranking – cheap and low-latency. */
const RERANK_MODEL = "llama-3.1-8b-instant";

/** Maximum number of chunks to send in a single re-rank batch. */
const MAX_BATCH = 20;

type RawScore = { index: number; score: number };

/**
 * Ask the LLM to score each chunk 0–10 for relevance to the query.
 * Returns parsed scores or falls back to original order on parse failure.
 */
async function scoreChunks(
  query: string,
  chunks: ScoredDocument[]
): Promise<RawScore[]> {
  const passages = chunks
    .slice(0, MAX_BATCH)
    .map(
      (c, i) =>
        `[${i}] (page ${c.doc.metadata?.page ?? "?"}, §${c.doc.metadata?.section ?? "?"})\n${c.doc.pageContent.slice(0, 300)}`
    )
    .join("\n\n");

  const prompt = `You are a relevance judge. Score each passage 0–10 based on how useful it is for answering the question.

Question: ${query}

Passages:
${passages}

Respond with ONLY a JSON array of objects like: [{"index":0,"score":8},{"index":1,"score":3},...]
No explanation, no markdown fences.`;

  try {
    const res = await groq.chat.completions.create({
      model: RERANK_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    // The model returns e.g. {"scores":[...]} or directly [...]
    const parsed: unknown = JSON.parse(raw);
    const arr: unknown = Array.isArray(parsed)
      ? parsed
      : (parsed as Record<string, unknown>).scores ??
        Object.values(parsed as Record<string, unknown>)[0];

    if (Array.isArray(arr)) {
      return (arr as RawScore[]).filter(
        (s) => typeof s.index === "number" && typeof s.score === "number"
      );
    }
  } catch {
    // Parse failure — fall back silently
  }

  // Fallback: keep original hybrid scores converted to 0-10 range
  return chunks.map((c, i) => ({ index: i, score: c.score * 10 }));
}

/**
 * Re-rank `candidates` by LLM relevance and return the top-`topN`.
 * If the LLM call fails the original order (hybrid score) is preserved.
 */
export async function rerank(
  query: string,
  candidates: ScoredDocument[],
  topN: number = 6
): Promise<ScoredDocument[]> {
  if (candidates.length === 0) return [];

  const scores = await scoreChunks(query, candidates);

  // Build a map: index → LLM score
  const scoreMap = new Map(scores.map(({ index, score }) => [index, score]));

  const rescored: ScoredDocument[] = candidates.map((c, i) => ({
    doc: c.doc,
    score: scoreMap.get(i) ?? c.score * 10,
  }));

  rescored.sort((a, b) => b.score - a.score);
  return rescored.slice(0, topN);
}
