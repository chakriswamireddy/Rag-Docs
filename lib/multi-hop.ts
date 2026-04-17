/**
 * Multi-hop retrieval.
 *
 * Some questions can only be answered by chaining multiple retrieval hops.
 * This module performs a two-hop search:
 *
 *   Hop 1: retrieve for the primary query
 *   Generate: ask LLM "what follow-up queries are needed?"
 *   Hop 2: retrieve for each follow-up query in parallel
 *   Merge: combine and deduplicate all retrieved chunks
 *
 * It is called from lib/rag.ts for query types classified as "multi-hop".
 * For all other types the standard single-hop pipeline is used.
 */
import Groq from "groq-sdk";
import { hybridRetrieve, type ScoredDocument } from "./retriever";
import type { RetrievalPlan } from "./router";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const SUBQUERY_PROMPT = `Given a question and some initial context passages, identify up to 3 specific follow-up queries needed to fully answer the question.

Rules:
- Each follow-up query must be a concrete, searchable question.
- Only generate queries if the initial context is genuinely insufficient.
- If the context already contains the answer, return an empty array.
- Respond with ONLY a JSON array of strings: ["<query1>","<query2>"]`;

async function generateFollowupQueries(
  question: string,
  firstHopContext: string
): Promise<string[]> {
  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: SUBQUERY_PROMPT },
        {
          role: "user",
          content: `Question: ${question}\n\nInitial context:\n${firstHopContext.slice(0, 1000)}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 200,
    });

    const raw = res.choices[0]?.message?.content ?? "[]";
    const parsed: unknown = JSON.parse(raw);
    const arr: unknown = Array.isArray(parsed)
      ? parsed
      : (parsed as Record<string, unknown>).queries ??
        Object.values(parsed as Record<string, unknown>)[0];

    if (Array.isArray(arr)) {
      return (arr as unknown[])
        .filter((s): s is string => typeof s === "string")
        .slice(0, 3);
    }
    return [];
  } catch {
    return [];
  }
}

function chunkKey(doc: ScoredDocument): string {
  const ci = doc.doc.metadata?.chunkIndex;
  if (ci !== undefined && ci !== null) return String(ci);
  return `${doc.doc.metadata?.page ?? 0}-${doc.doc.pageContent.slice(0, 40)}`;
}

/**
 * Execute a multi-hop retrieval plan and return merged, deduplicated chunks.
 * Falls back gracefully — if hop 2 yields nothing extra, hop 1 results are returned.
 */
export async function multiHopRetrieve(
  plan: RetrievalPlan
): Promise<ScoredDocument[]> {
  // Hop 1
  const hop1 = await hybridRetrieve(plan.primaryQuery, 10);

  const firstHopContext = hop1
    .slice(0, 3)
    .map((r) => r.doc.pageContent)
    .join("\n\n");

  // Generate follow-up queries from hop 1 context
  const followups = await generateFollowupQueries(
    plan.primaryQuery,
    firstHopContext
  );

  if (followups.length === 0) return hop1;

  // Hop 2: retrieve for all follow-up queries in parallel
  const hop2Results = await Promise.all(
    followups.map((q) => hybridRetrieve(q, 6))
  );

  // Merge: primary hop takes priority
  const merged = [...hop1];
  const seen = new Set(hop1.map(chunkKey));

  for (const batch of hop2Results) {
    for (const item of batch) {
      const key = chunkKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }

  return merged;
}
