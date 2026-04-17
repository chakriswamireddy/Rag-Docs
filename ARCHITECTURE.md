# Cloudflare Architecture & Workflow Notes

## Cloudflare Services in Use

| Service | Role |
|---|---|
| **R2** | Primary PDF object storage (S3-compatible) |
| **Workers** | `upload-router` — event routing and inline embedding |
| **Workers AI** | Embedding generation (`@cf/baai/bge-small-en-v1.5`, 384-dim) |

> **Not used:** Cloudflare D1, Cloudflare Queues, Cloudflare KV, Cloudflare Pages.  
> Queuing is handled by **AWS SQS** to offload large-file processing to AWS Lambda.

---

## System Components at a Glance

```
Browser
  └─▶ Next.js App          (API routes: /api/upload, /api/ask, /api/summarize)
         ├─▶ Cloudflare R2       (PDF storage, S3-compatible)
         ├─▶ Cloudflare Worker   (upload-router: embed + route)
         │       └─▶ Workers AI  (env.AI binding — in-process embeddings)
         ├─▶ AWS SQS             (overflow queue for large files)
         │       └─▶ AWS Lambda  (heavy-processor: large PDF ingestion)
         └─▶ Pinecone            (dense vector index)
```

---

## Upload Pipeline

### Step-by-step flow

```
User (browser)
    │  multipart/form-data PDF
    ▼
POST /api/upload  (Next.js)
    │  1. SHA-256(bytes) → docId   [content-addressed, idempotent]
    │  2. uploadPdfToR2(docId, buffer)
    │     └─ @aws-sdk/client-s3 against R2 endpoint (SigV4, region=auto)
    │     └─ Key: documents/{docId}.pdf
    │  3. POST to CF Worker  { docId, fileName, fileSize, fileUrl, uploadedAt }
    │     └─ Header: X-Worker-Secret: <secret>
    ▼
Cloudflare Worker: upload-router  (wrangler deploy, V8 isolate)
    │  Auth: X-Worker-Secret validated first
    │
    ├─ fileSize < 5 MB  ──▶  processInline()  via ctx.waitUntil()
    │       │  1. fetchFromR2(docId)          ← aws4fetch SigV4 against R2
    │       │  2. extractTextChunks(buffer)   ← unpdf (canvas-free, edge-safe)
    │       │  3. embedTexts(chunks, env)     ← env.AI.run("@cf/baai/bge-small-en-v1.5")
    │       │     └─ batches of 50 texts/request; 384-dim vectors
    │       │  4. upsertToPinecone(vectors, namespace=docId)  ← raw REST fetch
    │       └─ HTTP 200 returned immediately; processing runs in background
    │
    └─ fileSize ≥ 5 MB  ──▶  sendSQSMessage()  via ctx.waitUntil()
            │  aws4fetch SigV4 → AWS SQS
            │  FIFO: MessageDeduplicationId = docId, MessageGroupId = "pdf-processing"
            ▼
        AWS Lambda: heavy-processor  (Node.js ESNext)
            │  1. fetchPdfFromR2(docId)      ← @aws-sdk/client-s3 against R2
            │  2. extractText (unpdf)
            │  3. embedTexts(chunks)
            │     └─ tries CF_WORKER_URL/embed first
            │     └─ falls back to CF REST API
            │  4. upsertChunkRecords()       ← @pinecone-database/pinecone SDK
            └─ returns { batchItemFailures: [] }  [per-record SQS retry]
```

### Why the 5 MB split?

Cloudflare Workers have a **128 MB memory limit**. Large PDFs (many pages → many chunks → large embedding batches) can exceed this. Files ≥ 5 MB are routed to AWS Lambda which has configurable memory (up to 10 GB).

---

## Query / RAG Pipeline

```
POST /api/ask  { question, history, mode }
    │
    ▼  1. rewriteWithContext(question, history)
    │     └─ Groq llama-3.1-8b-instant
    │     └─ Resolves pronouns / co-references for retrieval independence
    ▼  2. buildRetrievalPlan(standaloneQ)
    │     └─ classifyQuery() → factual | comparative | multi-hop | ...
    │     └─ Produces: { primaryQuery, subQueries, type }
    ▼  3. embedQuery(q)
    │     └─ CF Worker /embed  →  env.AI.run()  (preferred)
    │     └─ fallback: CF REST API
    ▼  4. hybridRetrieve(query, k=20)
    │     ├─ Dense:  Pinecone.query() across ALL namespaces
    │     └─ Sparse: BM25 local search (data/bm25_index.json)
    │     Combined score: 0.6 × norm(dense) + 0.4 × norm(sparse)
    ▼  5. rerank(query, merged, top=6)
    ▼  6. Context assembly → Groq chat completion (llama-3.1-8b-instant)
    ▼  7. verifyAnswer()  [grounding check]
    ▼  8. trace() → data/traces.jsonl + in-memory ring buffer
    ▼
Response: { answer, sources, queryType, verification }
  (streaming NDJSON for mode="stream" | "agent")
```

---

## Worker Architecture

### `workers/upload-router` — Cloudflare Worker

| Route | Method | Purpose |
|---|---|---|
| `/` | POST | Main event router: inline vs SQS dispatch |
| `/embed` | POST | Embedding endpoint (proxied by Next.js / Lambda) |

Key traits:
- **`ctx.waitUntil()`** — responds HTTP 200 immediately; processing runs async in background
- **`aws4fetch`** — Web Crypto SigV4 signing; no Node.js AWS SDK needed
- **`unpdf`** — PDF text extraction with no native module dependency (edge-safe)
- **Workers AI binding** (`env.AI`) — in-process calls to `@cf/baai/bge-small-en-v1.5`
- `compatibility_date = "2026-04-13"`; deployed via `wrangler deploy`

### `workers/heavy-processor` — AWS Lambda

- Triggered by SQS batch events (`SQSEvent`)
- Full Node.js runtime — can use `@aws-sdk/client-s3`, `@pinecone-database/pinecone`
- Uses logic shared with Next.js via the `shared/` directory
- Returns `{ batchItemFailures }` enabling per-message retry on partial failures

---

## Environment Variables & Bindings

### `wrangler.toml` (Cloudflare Worker)

```toml
[ai]
binding = "AI"      # Workers AI in-process binding

[vars]
R2_ENDPOINT     = "https://<account_id>.r2.cloudflarestorage.com"
R2_BUCKET_NAME  = "rag-docs"
R2_PUBLIC_URL   = "https://pub-<hash>.r2.dev"
SQS_QUEUE_URL   = "https://sqs.us-east-1.amazonaws.com/<account>/rag-processing-queue"
AWS_REGION      = "us-east-1"
```

Secrets (added with `wrangler secret put`):  
`WORKER_SECRET` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `PINECONE_API_KEY` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY`

### Next.js `.env`

| Variable | Purpose |
|---|---|
| `CF_WORKER_URL` | Upload-router Worker base URL |
| `CF_WORKER_SECRET` | Shared secret for Worker auth |
| `CF_ACCOUNT_ID` / `CF_API_TOKEN` | Fallback CF REST API for embeddings |
| `R2_ENDPOINT` / `R2_BUCKET_NAME` | R2 connection |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_PUBLIC_URL` | R2 credentials |
| `PINECONE_API_KEY` / `PINECONE_INDEX_NAME` / `PINECONE_NAMESPACE` | Pinecone access |
| `GROQ_API_KEY` / `GROQ_MODEL` | LLM (chat + query rewriting) |

---

## Embedding Generation Details

**Model:** `@cf/baai/bge-small-en-v1.5` — 384 dimensions, hosted by Cloudflare Workers AI.

Three code paths tried in order by `shared/embeddings.ts`:

```
1. CF Worker /embed  (preferred)
   POST {CF_WORKER_URL}/embed  { text: string[] }
   Worker calls env.AI.run() in-process — zero egress cost

2. CF REST API  (fallback)
   POST https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-small-en-v1.5

3. Error thrown
```

**Chunking strategy:**
- 500-character window, 80-character overlap
- `unpdf` extracts text page-by-page
- Each chunk stored in Pinecone with metadata: `{ docId, page, chunkIndex, text, source, uploadedAt, section }`

---

## Pinecone + Cloudflare: How They Interact

Cloudflare Workers AI provides **embeddings**. Pinecone stores and queries **vectors**. They are independent services glued together by the vector data.

| Context | Pinecone Client |
|---|---|
| Cloudflare Worker | Raw `fetch()` REST calls to `PINECONE_INDEX_HOST` (no SDK — edge-compatible) |
| Next.js app | `@pinecone-database/pinecone` Node.js SDK |
| AWS Lambda | `@pinecone-database/pinecone` Node.js SDK |

**Namespace strategy:** every `docId` → its own Pinecone namespace.  
Benefits: per-document idempotency, per-document deletion, no cross-document pollution.

**Idempotency guard** (both Worker and Lambda):
```ts
const existing = await namespaceVectorCount(namespace);
if (existing > 0) {
  console.log("already indexed, skipping");
  return;
}
```

---

## AWS SQS Integration

The Cloudflare Worker signs SQS requests itself using `aws4fetch` (Web Crypto SigV4) — no AWS SDK bundle required inside the Worker.

```ts
// workers/upload-router/src/sqs.ts
const params = new URLSearchParams({
  Action: "SendMessage",
  MessageBody: JSON.stringify({ docId, fileUrl, fileName, uploadedAt }),
});
if (isFifo) {
  params.set("MessageDeduplicationId", message.docId);  // exactly-once delivery
  params.set("MessageGroupId", "pdf-processing");
}
await aws.fetch(env.SQS_QUEUE_URL, { method: "POST", body: params });
```

The Lambda reads SQS batches and returns `{ batchItemFailures }` so SQS can re-deliver only the failed messages rather than the entire batch.

---

## Complete End-to-End Data Flow

```
┌──────────────────────────── UPLOAD PATH ──────────────────────────────┐
│                                                                        │
│  Browser ──PDF──▶ Next.js /api/upload                                 │
│                       │                                                │
│               SHA-256(bytes) = docId  [idempotent key]                │
│                       │                                                │
│               R2 PUT documents/{docId}.pdf                             │
│               (@aws-sdk/client-s3, SigV4, region=auto)                │
│                       │                                                │
│               POST CF Worker /                                         │
│               X-Worker-Secret: ***                                     │
│                       │                                                │
│               ┌───────┴────────┐                                      │
│           <5MB│                │≥5MB                                   │
│               ▼                ▼                                       │
│        Workers AI          SQS SendMessage                             │
│        env.AI.run()        (aws4fetch, SigV4)                          │
│        bge-small-en             │                                      │
│               │                ▼                                       │
│               │          AWS Lambda                                    │
│               │          fetchPdfFromR2 (@aws-sdk)                     │
│               │          embedTexts (→ CF Worker /embed)               │
│               │                │                                       │
│               └────────┬───────┘                                       │
│                        ▼                                               │
│               Pinecone upsert                                          │
│               namespace = docId                                        │
│               batches of 100 vectors                                   │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── QUERY PATH ───────────────────────────────┐
│                                                                        │
│  Browser ──question──▶ Next.js /api/ask                               │
│                            │                                           │
│                    rewriteWithContext (Groq)                           │
│                    classifyQuery (Groq)                                │
│                            │                                           │
│                    embedQuery(q)                                       │
│                    → CF Worker /embed → env.AI.run()                   │
│                    → (fallback) CF REST API                            │
│                            │                                           │
│                   ┌────────┴────────┐                                  │
│                   ▼                 ▼                                  │
│             Pinecone query      BM25 search                            │
│             (all namespaces)    (local JSON)                           │
│                   └────────┬────────┘                                  │
│                            ▼                                           │
│                Hybrid score merge                                      │
│                0.6 × dense + 0.4 × sparse                              │
│                            │                                           │
│                        Rerank top-6                                    │
│                            │                                           │
│                Groq chat completion                                    │
│                llama-3.1-8b-instant                                    │
│                            │                                           │
│                Grounding verification                                  │
│                Telemetry trace → traces.jsonl                          │
│                            │                                           │
│                Response ──▶ Browser                                    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Architectural Decisions

| Decision | Reason |
|---|---|
| R2 accessed as S3-compatible storage everywhere | Same SigV4 tooling works in Next.js, Lambda, and the Worker — no custom SDK needed |
| `shared/` directory compiled into both Worker and Lambda | Prevents logic drift between the two processing paths |
| Workers AI as sole embedding provider | Single model, consistent 384-dim vectors; accessed in-process (binding) or over HTTP |
| AWS SQS over Cloudflare Queues | Existing AWS Lambda setup; Lambda handles memory-intensive PDFs without hitting the 128 MB Worker limit |
| `ctx.waitUntil()` for async processing | Worker returns HTTP 200 instantly while processing continues; avoids browser timeout on large files |
| `docId = SHA-256(bytes)` | Content-addressed: uploading the same PDF twice is a no-op at every stage |
| Per-document Pinecone namespaces | Clean isolation; enables targeted delete and idempotent upsert without scanning all vectors |
