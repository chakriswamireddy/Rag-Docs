import { hybridRetrieve } from "./retriever";
import { rerank } from "./reranker";
import { buildRetrievalPlan, type ConversationTurn } from "./router";
import { rewriteWithContext } from "./memory";
import { cacheKey, getCached, setCached } from "./cache";
import { verifyAnswer } from "./guardrails";
import { trace, makeQueryId } from "./telemetry";
import { multiHopRetrieve } from "./multi-hop";
import type { QueryType } from "./query-classifier";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `You are a precise document assistant. Follow these rules strictly:
1. Answer ONLY from the provided context chunks. Do not use outside knowledge.
2. For every factual claim, cite its source inline: "According to [chunk-N, page P, §Section]..."
3. If the answer cannot be found in ANY chunk, respond exactly: "Not found in document."
4. For comparisons or multi-part questions, use a structured format.
5. Never invent numbers, dates, names, or statistics.`;

export type AskResult = {
  answer: string | null;
  sources: Record<string, unknown>[];
  queryType: QueryType;
  /** Grounding verification results. */
  verification?: {
    isGrounded: boolean;
    confidence: number;
    unsupportedClaims: string[];
  };
};

/** Shared retrieval pipeline used by both the JSON and streaming paths. */
async function runPipeline(question: string, history: ConversationTurn[]) {
  const standaloneQ = await rewriteWithContext(question, history);
  const plan = await buildRetrievalPlan(standaloneQ);

  const t0 = performance.now();

  // For multi-hop queries, use the dedicated two-hop retriever
  let primaryResults;
  if (plan.type === "multi-hop") {
    primaryResults = await multiHopRetrieve(plan);
  } else {
    primaryResults = await hybridRetrieve(plan.primaryQuery, 20);
  }

  const subResults = await Promise.all(
    plan.subQueries.map((sq) => hybridRetrieve(sq, 10))
  );

  const merged = [...primaryResults];
  for (const batch of subResults) {
    for (const item of batch) {
      const key =
        item.doc.metadata?.chunkIndex !== undefined
          ? String(item.doc.metadata.chunkIndex)
          : item.doc.pageContent.slice(0, 40);
      const exists = merged.some(
        (m) =>
          (m.doc.metadata?.chunkIndex !== undefined
            ? String(m.doc.metadata.chunkIndex)
            : m.doc.pageContent.slice(0, 40)) === key
      );
      if (!exists) merged.push(item);
    }
  }

  const retrievalMs = performance.now() - t0;

  const t1 = performance.now();
  const top = await rerank(standaloneQ, merged, 6);
  const rerankMs = performance.now() - t1;

  const context = top
    .map(
      (r, i) =>
        `[chunk-${i}, page ${r.doc.metadata?.page ?? "?"}, §${r.doc.metadata?.section ?? "General"}]\n${r.doc.pageContent}`
    )
    .join("\n\n");

  const historyMessages: Groq.Chat.ChatCompletionMessageParam[] = history
    .slice(-4)
    .flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.answer },
    ]);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMessages,
    {
      role: "user",
      content: `Context chunks:\n${context}\n\nQuestion: ${standaloneQ}`,
    },
  ];

  const sources = top.map((r) => ({
    ...r.doc.metadata,
    relevanceScore: r.score,
  }));

  return {
    messages,
    sources,
    queryType: plan.type,
    top,
    retrievalMs,
    rerankMs,
    chunksRetrieved: merged.length,
  };
}

export async function askQuestion(
  question: string,
  history: ConversationTurn[] = []
): Promise<AskResult & { cached?: boolean }> {
  const totalStart = performance.now();
  const queryId = makeQueryId();

  // Only cache for single-turn (no history) queries to keep things simple
  const key = history.length === 0 ? cacheKey(question) : null;
  if (key) {
    const hit = getCached(key);
    if (hit) return hit;
  }

  const { messages, sources, queryType, top, retrievalMs, rerankMs, chunksRetrieved } =
    await runPipeline(question, history);

  const llmStart = performance.now();
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
  });
  const llmMs = performance.now() - llmStart;

  const result: AskResult = {
    answer: completion.choices[0]?.message?.content ?? null,
    sources,
    queryType,
  };

  // Verify grounding (non-blocking — failure returns safe default)
  if (result.answer) {
    result.verification = await verifyAnswer(result.answer, top);
  }

  const totalMs = performance.now() - totalStart;

  // Emit telemetry
  trace({
    queryId,
    timestamp: new Date().toISOString(),
    question,
    queryType,
    retrievalMs: Math.round(retrievalMs),
    rerankMs: Math.round(rerankMs),
    llmMs: Math.round(llmMs),
    totalMs: Math.round(totalMs),
    chunksRetrieved,
    estimatedTokens: Math.round(
      messages.reduce((s, m) => s + (typeof m.content === "string" ? m.content.length / 4 : 0), 0)
    ),
    isGrounded: result.verification?.isGrounded ?? true,
    groundingConfidence: result.verification?.confidence ?? 1,
    cacheHit: false,
  });

  if (key) setCached(key, result);
  return result;
}

export type StreamEvent =
  | { type: "meta"; queryType: QueryType; sources: Record<string, unknown>[] }
  | { type: "token"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

/**
 * Streaming variant. Returns a ReadableStream that emits newline-delimited
 * JSON events (NDJSON):
 *   {"type":"meta","queryType":"factual","sources":[...]}
 *   {"type":"token","content":"The "}
 *   ...
 *   {"type":"done"}
 */
export function streamAskQuestion(
  question: string,
  history: ConversationTurn[] = []
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const { messages, sources, queryType } = await runPipeline(
          question,
          history
        );

        send({ type: "meta", queryType, sources });

        const stream = await groq.chat.completions.create({
          model: GROQ_MODEL,
          messages,
          stream: true,
        });

        for await (const chunk of stream) {
          const token = chunk.choices[0]?.delta?.content;
          if (token) send({ type: "token", content: token });
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
}