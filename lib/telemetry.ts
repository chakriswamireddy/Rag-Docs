/**
 * Telemetry / observability layer.
 *
 * Appends structured trace events to data/traces.jsonl (one JSON object per
 * line so the file stays grep-friendly and never needs to be fully parsed).
 * Module also keeps an in-memory ring buffer of the last 200 events for the
 * /api/traces endpoint to return without reading disk.
 *
 * Dual-write: also writes key metrics to the PostgreSQL metrics table.
 */
import fs from "fs";
import path from "path";
import type { QueryType } from "./query-classifier";
import { recordMetric } from "./services/metrics.service";

export type TraceEvent = {
  queryId: string;
  timestamp: string;
  question: string;
  queryType: QueryType;
  retrievalMs: number;
  rerankMs: number;
  llmMs: number;
  totalMs: number;
  chunksRetrieved: number;
  /** Approximate token count of the prompt sent to the LLM. */
  estimatedTokens: number;
  isGrounded: boolean;
  groundingConfidence: number;
  cacheHit: boolean;
  tenantId?: string | null;
};

const TRACES_PATH = path.join(process.cwd(), "data", "traces.jsonl");
const RING_BUFFER_SIZE = 200;

const ring: TraceEvent[] = [];

/** Append a trace event to disk, the in-memory buffer, and DB metrics. */
export function trace(event: TraceEvent): void {
  // In-memory ring buffer
  ring.push(event);
  if (ring.length > RING_BUFFER_SIZE) ring.shift();

  // Append to disk (best-effort, non-blocking)
  try {
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.appendFileSync(TRACES_PATH, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // Disk write failure must never crash the main pipeline
  }

  // Dual-write to DB metrics (best-effort, non-blocking)
  const tenantId = event.tenantId ?? null;
  const metadata = {
    queryId: event.queryId,
    queryType: event.queryType,
    cacheHit: event.cacheHit,
    isGrounded: event.isGrounded,
  };

  Promise.all([
    recordMetric(tenantId, "retrieval_latency", event.retrievalMs, metadata),
    recordMetric(tenantId, "rerank_latency", event.rerankMs, metadata),
    recordMetric(tenantId, "llm_latency", event.llmMs, metadata),
    recordMetric(tenantId, "total_latency", event.totalMs, metadata),
    recordMetric(tenantId, "token_usage", event.estimatedTokens, metadata),
  ]).catch(() => {
    // DB write failure must never crash the main pipeline
  });
}

/** Return the last `n` trace events from the in-memory ring buffer. */
export function getRecentTraces(n: number = 50): TraceEvent[] {
  return ring.slice(-n);
}

/** Generate a short random query ID. */
export function makeQueryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
