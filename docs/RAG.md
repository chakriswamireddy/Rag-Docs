# RAG Architecture & Specifications

## What kind of RAG is this?

**Advanced / Modular RAG, with an optional Agentic (ReAct) mode.**

It is **not Naive RAG** and **not Graph RAG**:

- **Not Naive RAG** — naive RAG is just *chunk → embed → single vector search → stuff into
  prompt → answer*. This system adds pre-retrieval query transformation, hybrid retrieval,
  post-retrieval reranking, and post-generation grounding verification.
- **Not Graph RAG** — there is no knowledge-graph construction (no entity/relationship
  extraction, no graph store, no graph traversal). The `multi-hop` query type is *iterative
  query decomposition*, not graph walking.
- **It is Advanced RAG** — it implements the canonical advanced-RAG stages (query rewriting,
  routing/classification, decomposition, hybrid search, reranking, self-checking) **plus an
  optional ReAct agent**, which places it in *Agentic RAG* territory.

## Pipeline

The default flow is `runPipeline` in [`lib/rag.ts`](../lib/rag.ts):

```
Question
  │
  1. Query rewrite (conversational → standalone)         lib/memory.ts
  2. Classify + plan (5 types, sub-query decomposition)  lib/router.ts + lib/query-classifier.ts
  3. Retrieve (scoped):                                  lib/retriever.ts
       • Dense:  Pinecone (384-d, cosine)
       • Sparse: BM25 (rebuilt per request from Postgres)
       • Hybrid blend  α·dense + (1-α)·sparse
       • Multi-hop (2-hop) for multi-hop queries         lib/multi-hop.ts
  4. Merge + dedupe (key: docId:chunkIndex)
  5. Rerank (LLM-as-judge, 0–10) → top 6                 lib/reranker.ts
  6. Build cited context  [chunk-i, page P, §Section]
  7. Generate (Groq, streaming NDJSON)                   lib/rag.ts
  8. Grounding guardrail (hallucination check)           lib/guardrails.ts
  9. Log (telemetry + Postgres) + LRU cache
```

An alternative **agentic path** (`mode: "agent"`) bypasses the linear pipeline for a ReAct
loop in [`lib/agent/executor.ts`](../lib/agent/executor.ts).

Ingestion is synchronous in the upload route: parse → chunk → embed → upsert → persist
(see [`lib/pdf-indexer.ts`](../lib/pdf-indexer.ts)).

## Specifications

| Stage | Details | Source |
| --- | --- | --- |
| **Embeddings** | `@cf/baai/bge-small-en-v1.5` (Cloudflare Workers AI), **384-dim**, cosine | `shared/embeddings.ts` |
| **Vector store** | Pinecone serverless. Namespaces isolate data: `tenant_<id>` for tenant users, per-document `<docId hash>` for tenant-less users. Metadata `docId` filter for in-namespace scoping | `lib/pinecone.ts`, `lib/retriever.ts` |
| **Chunking** | Per-page semantic chunking (paragraph → sentence), **target 500 / max 800 / min 200 chars**, with a heading-detection heuristic for section titles | `lib/pdf-indexer.ts` |
| **Sparse (BM25)** | Custom BM25, `k1 = 1.5`, `b = 0.75`. Rebuilt **per request** in memory from the selected documents' Postgres chunks (fresh + scoped), not a static file | `lib/bm25-store.ts`, `lib/query-scope.ts` |
| **Hybrid blend** | `score = α·norm(dense) + (1-α)·norm(sparse)`, **α = 0.6** (60% semantic / 40% keyword), min-max normalized, unified per chunk by `docId:chunkIndex` | `lib/retriever.ts` |
| **Query rewrite** | Follow-ups rewritten into standalone questions using the last 4 turns | `lib/memory.ts` |
| **Classification** | 5 types — `factual \| summarization \| comparison \| multi-hop \| calculation` — plus sub-query decomposition for comparison/multi-hop | `lib/query-classifier.ts`, `lib/router.ts` |
| **Retrieval depth** | Primary **k=20**, sub-queries **k=10**; multi-hop hop-1 **10** / hop-2 **6**, up to 3 generated follow-ups | `lib/rag.ts`, `lib/multi-hop.ts` |
| **Reranking** | **LLM-as-reranker**: Groq `llama-3.1-8b-instant` scores each passage 0–10, returns **top 6**; falls back to hybrid score on failure (code notes a swap path to a `ms-marco-MiniLM-L-6-v2` cross-encoder) | `lib/reranker.ts` |
| **Generation** | Groq `llama-3.1-8b-instant` (configurable via `GROQ_MODEL`), **streaming** NDJSON. System prompt enforces *answer only from context*, inline citations `[chunk-N, page P, §Section]`, and the exact fallback `"Not found in document."` | `lib/rag.ts` |
| **Grounding guardrail** | Second LLM pass returns `{ isGrounded, confidence 0–1, unsupportedClaims[] }`; non-blocking | `lib/guardrails.ts` |
| **Agentic (ReAct)** | Thought → Action → Observation loop, **max 5 iterations**, tool registry, more capable model `llama-3.3-70b-versatile` (`GROQ_AGENT_MODEL`) | `lib/agent/executor.ts`, `lib/agent/tools.ts` |
| **Caching** | In-memory LRU (100 entries, 1 h TTL), single-turn only, key scoped by question **+ document set** | `lib/cache.ts` |
| **Observability** | Telemetry traces; queries / retrievals / responses / citations logged to Postgres; built-in evaluation tables | `lib/telemetry.ts`, `lib/services/query.service.ts`, `lib/db/schema.ts` |
| **Citations** | Returned to the UI as `documentName / section / page / chunkPreview` | `lib/rag.ts` |
| **Multi-tenancy** | Isolation at Pinecone namespace + metadata level, plus per-document query scoping | `lib/retriever.ts`, `lib/query-scope.ts` |

## Honest gaps vs. a "maximal" advanced setup

- The reranker is an **LLM judge**, not a true cross-encoder (a swap path is noted in
  `lib/reranker.ts`).
- There is **no graph layer** — relationships between entities are not modeled or traversed.
