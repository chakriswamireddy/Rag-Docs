/**
 * Query classifier.
 *
 * Classifies the user's question into one of five types so the router can
 * choose the most appropriate retrieval strategy.
 *
 * Types:
 *   factual       – Single-fact lookup ("What is the invoice total?")
 *   summarization – Broad overview ("Summarise section 3")
 *   comparison    – Two or more subjects ("Compare 2022 vs 2023 revenue")
 *   multi-hop     – Requires chaining facts ("Who signed the contract that
 *                   was referenced in the appendix?")
 *   calculation   – Arithmetic needed ("What is 18% of the quoted price?")
 */
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export type QueryType =
  | "factual"
  | "summarization"
  | "comparison"
  | "multi-hop"
  | "calculation";

export type ClassificationResult = {
  type: QueryType;
  /** Decomposed sub-questions, populated for comparison / multi-hop types. */
  subQueries: string[];
};

const CLASSIFIER_PROMPT = `You are a query classifier for a RAG system. Classify the question into exactly one of these types:
- factual: single fact, definition, or date lookup
- summarization: broad overview or summary request
- comparison: comparing two or more things, periods, or entities
- multi-hop: answer requires chaining multiple facts from different parts of a document
- calculation: requires arithmetic on numbers found in the document

Also extract sub-queries if the type is "comparison" or "multi-hop".

Respond with ONLY valid JSON — no markdown, no explanation:
{"type":"<type>","subQueries":["<sub-query-1>","<sub-query-2>"]}

If no sub-queries are needed, return an empty array.`;

export async function classifyQuery(
  question: string
): Promise<ClassificationResult> {
  const fallback: ClassificationResult = { type: "factual", subQueries: [] };

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 200,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      type?: string;
      subQueries?: unknown;
    };

    const VALID_TYPES: QueryType[] = [
      "factual",
      "summarization",
      "comparison",
      "multi-hop",
      "calculation",
    ];

    const type = VALID_TYPES.includes(parsed.type as QueryType)
      ? (parsed.type as QueryType)
      : "factual";

    const subQueries = Array.isArray(parsed.subQueries)
      ? (parsed.subQueries as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, 4)
      : [];

    return { type, subQueries };
  } catch {
    return fallback;
  }
}
