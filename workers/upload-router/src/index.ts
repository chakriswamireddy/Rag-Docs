/**
 * Cloudflare Worker: upload-router
 *
 * Receives upload events from the Next.js API and routes them:
 *  - Small files (< 5 MB): process inline (fetch R2 → chunk → embed → Pinecone)
 *  - Large files (≥ 5 MB): push a message to AWS SQS for Lambda processing
 *
 * Responds immediately; heavy work runs via ctx.waitUntil().
 */

import { fetchFromR2 } from "./r2";
import { extractTextChunks } from "./pdf-chunker";
import { embedTexts } from "./embedder";
import { isAlreadyIndexed, upsertToPinecone } from "./pinecone";
import { sendSQSMessage } from "./sqs";
import type { UploadQueueMessage } from "../../../shared/types";

export interface Env {
  // Shared secret validated on every request
  WORKER_SECRET: string;

  // Cloudflare R2 (S3-compatible)
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_URL: string; // public-facing base URL for file links

  // Pinecone
  PINECONE_API_KEY: string;
  PINECONE_INDEX_HOST: string; // e.g. https://my-index-xxxx.svc.pinecone.io

  // AWS SQS
  SQS_QUEUE_URL: string;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;

  // Cloudflare Workers AI (for embeddings)
  AI: {
    run(model: string, payload: unknown): Promise<unknown>;
  };

  // Webhook callback URL (Next.js app)
  WEBHOOK_URL: string;
  WEBHOOK_SECRET: string;
}

const SMALL_FILE_THRESHOLD = 5 * 1024 * 1024; // 5 MB

export interface UploadEvent {
  docId: string;
  fileUrl?: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  tenantId?: string | null;
  userId?: string | null;
}

interface EmbedEvent {
  text: string[];
}

const INLINE_TIMEOUT_MS = 25_000;

const handler = {
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil(promise: Promise<unknown>): void }
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const secret = request.headers.get("X-Worker-Secret");
    if (!secret || secret !== env.WORKER_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(request.url);
    if (url.pathname === "/embed") {
      return handleEmbedRequest(request, env);
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let event: UploadEvent;
    try {
      event = (await request.json()) as UploadEvent;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { docId, fileName, fileSize, uploadedAt } = event;
    if (!docId || !fileName || typeof fileSize !== "number") {
      return new Response("Missing required fields: docId, fileName, fileSize", {
        status: 400,
      });
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return new Response("Unsupported file type — only PDF is accepted", {
        status: 400,
      });
    }

    // ── Route ───────────────────────────────────────────────────────────────
    if (fileSize < SMALL_FILE_THRESHOLD) {
      // Process inline; use waitUntil so the response is returned immediately
      ctx.waitUntil(withTimeout(processInline(event, env), INLINE_TIMEOUT_MS, event.docId));
    } else {
      // Queue for Lambda via SQS
      const msg: UploadQueueMessage = {
        docId,
        fileUrl: event.fileUrl ?? `${env.R2_PUBLIC_URL}/documents/${docId}.pdf`,
        fileName,
        uploadedAt,
      };
      ctx.waitUntil(
        sendSQSMessage(msg, env)
      );
    }

    return Response.json({
      ok: true,
      docId,
      route: fileSize < SMALL_FILE_THRESHOLD ? "inline" : "queue",
    });
  },
};

export default handler;

async function handleEmbedRequest(request: Request, env: Env): Promise<Response> {
  let event: EmbedEvent;
  try {
    event = (await request.json()) as EmbedEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!Array.isArray(event.text) || event.text.length === 0) {
    return Response.json(
      { error: "The text field must be a non-empty string array." },
      { status: 400 }
    );
  }

  if (event.text.some((value) => typeof value !== "string" || value.trim() === "")) {
    return Response.json(
      { error: "Each text item must be a non-empty string." },
      { status: 400 }
    );
  }

  const data = await embedTexts(event.text, env);
  return Response.json({ data });
}

// ── Inline processor (small files only) ────────────────────────────────────

async function processInline(event: UploadEvent, env: Env): Promise<void> {
  const { docId, fileName, uploadedAt, tenantId } = event;
  // Use tenant namespace if available, otherwise fall back to per-document namespace
  const namespace = tenantId ? `tenant_${tenantId}` : docId;

  // Idempotency: skip if already indexed in this namespace
  if (await isAlreadyIndexed(namespace, env)) {
    console.log(`[worker] ${docId} already indexed in ${namespace}, skipping`);
    return;
  }

  // Notify: parsing started
  await sendWebhook(env, { docId, stage: "parsing", status: "started" });

  // 1. Fetch PDF bytes from R2
  const buffer = await fetchFromR2(docId, env);

  // Notify: chunking started
  await sendWebhook(env, { docId, stage: "chunking", status: "started" });

  // 2. Extract text and split into semantic chunks
  const chunks = await extractTextChunks(buffer, fileName, docId, uploadedAt);

  await sendWebhook(env, { docId, stage: "chunking", status: "completed" });

  // Notify: embedding started
  await sendWebhook(env, { docId, stage: "embedding", status: "started" });

  // 3. Embed in batches (Workers AI supports batch input)
  const EMBED_BATCH = 50;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const texts = chunks.slice(i, i + EMBED_BATCH).map((c) => c.text);
    const vecs = await embedTexts(texts, env);
    allEmbeddings.push(...vecs);
  }

  await sendWebhook(env, { docId, stage: "embedding", status: "completed" });

  // Notify: indexing started
  await sendWebhook(env, { docId, stage: "indexing", status: "started" });

  // 4. Build Pinecone records
  const vectors = chunks.map((chunk, i) => ({
    id: `${docId}-${i}`,
    values: allEmbeddings[i],
    metadata: {
      docId,
      page: chunk.page,
      chunkIndex: i,
      text: chunk.text,
      source: fileName,
      uploadedAt,
      ...(tenantId ? { tenantId } : {}),
    },
  }));

  // 5. Upsert to Pinecone (tenant namespace)
  await upsertToPinecone(vectors, namespace, env);

  // 6. Send final webhook with chunk data for DB storage
  const chunkData = chunks.map((chunk, i) => ({
    chunkIndex: i,
    content: chunk.text,
    sectionTitle: chunk.section,
    pageNumber: chunk.page,
    embeddingId: `${docId}-${i}`,
  }));

  await sendWebhook(env, {
    docId,
    stage: "indexing",
    status: "completed",
    totalChunks: chunks.length,
    chunks: chunkData,
  });

  console.log(`[worker] ${docId} indexed ${chunks.length} chunks in namespace ${namespace}`);
}

/** Send a webhook callback to the Next.js app. Best-effort, never throws. */
async function sendWebhook(
  env: Env,
  payload: Record<string, unknown>
): Promise<void> {
  if (!env.WEBHOOK_URL) return;
  try {
    await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": env.WEBHOOK_SECRET || "",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[worker] webhook failed:", err);
  }
}

async function withTimeout(task: Promise<void>, timeoutMs: number, docId: string) {
  try {
    await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Inline processing timeout")), timeoutMs);
      }),
    ]);
  } catch (error) {
    console.error(`[worker] inline processing failed for ${docId}:`, error);
  }
}
