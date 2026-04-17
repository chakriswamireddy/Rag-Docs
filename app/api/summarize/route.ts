/**
 * Document intelligence endpoint.
 *
 * POST /api/summarize
 * Body: { fileName?: string }
 *
 * Loads all indexed chunks (optionally filtered to one file), runs a two-pass
 * hierarchical summarisation, and extracts key entities, dates, and numbers.
 *
 * Response:
 * {
 *   summary:     string,
 *   keyInsights: string[],
 *   entities:    { type: string, value: string }[],
 *   metadata:    { source: string, chunkCount: number, pages: number[] }
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { loadBM25Index } from "@/lib/bm25-store";
import { embedQuery } from "@/lib/embeddings";
import { index } from "@/lib/pinecone";
import { Document } from "langchain/document";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
const MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

/** Split an array into batches of size n. */
function batch<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const SECTION_SUMMARY_PROMPT = `Summarise the following document passages in 3-5 sentences. Be concise and factual. Only use information from the passages.`;

const FINAL_SUMMARY_PROMPT = `You are given several partial summaries of sections of a document. Write a single coherent summary of the whole document in 5-8 sentences. Extract:
1. Key insights (bullet points)
2. Named entities (people, organisations, dates, amounts, locations)

Respond with ONLY valid JSON (no markdown):
{
  "summary": "...",
  "keyInsights": ["...", "..."],
  "entities": [{"type": "person|org|date|amount|location","value":"..."}]
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const fileName = typeof body?.fileName === "string" ? body.fileName : null;

    // ── Load all indexed chunks via Pinecone ─────────────────────────────
    // We query with a generic embedding to retrieve a broad set of chunks.
    loadBM25Index(); // idempotent

    // Query across all indexed namespaces (one per docId after migration)
    const queryEmbedding = await embedQuery("document content summary");
    const stats = await index.describeIndexStats();
    const namespaces = Object.keys(stats.namespaces ?? {});
    const searchNs = namespaces.length > 0 ? namespaces : [process.env.PINECONE_NAMESPACE ?? "default"];
    const nsResults = await Promise.all(
      searchNs.map((ns) =>
        index.namespace(ns).query({ vector: queryEmbedding, topK: 200, includeMetadata: true })
      )
    );
    const pineconeRes = { matches: nsResults.flatMap((r) => r.matches ?? []) };

    const allDocs = (pineconeRes.matches ?? []).map((match) => {
      const meta = (match.metadata ?? {}) as Record<string, unknown>;
      return new Document({
        pageContent: String(meta.text ?? ""),
        metadata: Object.fromEntries(
          Object.entries(meta).filter(([k]) => k !== "text")
        ),
      });
    });

    // Optionally filter to a specific file
    const docs = fileName
      ? allDocs.filter(
          (d) =>
            String(d.metadata?.source ?? "").toLowerCase() ===
            fileName.toLowerCase()
        )
      : allDocs;

    if (docs.length === 0) {
      return NextResponse.json(
        { error: "No indexed documents found. Upload a PDF first." },
        { status: 404 }
      );
    }

    // ── Pass 1: summarise in batches of 8 chunks ─────────────────────────
    const batches = batch(docs, 8);
    const sectionSummaries: string[] = [];

    for (const b of batches) {
      const passages = b
        .map(
          (d, i) =>
            `[${i + 1}] (page ${d.metadata?.page ?? "?"}, §${d.metadata?.section ?? "?"})\n${d.pageContent}`
        )
        .join("\n\n");

      const res = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SECTION_SUMMARY_PROMPT },
          { role: "user", content: passages },
        ],
        temperature: 0.2,
        max_tokens: 300,
      });

      const summary = res.choices[0]?.message?.content?.trim();
      if (summary) sectionSummaries.push(summary);
    }

    // ── Pass 2: combine section summaries into final output ──────────────
    const combinedSummaries = sectionSummaries.join("\n\n---\n\n");

    const finalRes = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: FINAL_SUMMARY_PROMPT },
        { role: "user", content: combinedSummaries },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 800,
    });

    const raw = finalRes.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      summary?: string;
      keyInsights?: unknown;
      entities?: unknown;
    };

    const pages = [
      ...new Set(
        docs
          .map((d) => Number(d.metadata?.page))
          .filter((p) => !isNaN(p) && p > 0)
      ),
    ].sort((a, b) => a - b);

    const sources = [
      ...new Set(docs.map((d) => String(d.metadata?.source ?? "unknown"))),
    ];

    return NextResponse.json({
      summary: parsed.summary ?? "No summary generated.",
      keyInsights: Array.isArray(parsed.keyInsights) ? parsed.keyInsights : [],
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      metadata: {
        sources,
        chunkCount: docs.length,
        pages,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[summarize] error:", message, err);
    return NextResponse.json(
      { error: "Summarization failed", detail: message },
      { status: 500 }
    );
  }
}
