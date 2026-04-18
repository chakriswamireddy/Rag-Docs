import { NextRequest, NextResponse } from "next/server";
import {
  updateDocumentStatus,
  storeChunks,
  getDocumentByHash,
} from "@/lib/services/document.service";
import {
  getJobByDocAndStage,
  startJob,
  completeJob,
  failJob,
  createJob,
} from "@/lib/services/processing.service";

/**
 * POST /api/webhooks/processing
 *
 * Called by the CF Worker / Lambda after each processing stage.
 * Body: {
 *   docId: string (SHA-256 hash),
 *   stage: "parsing" | "chunking" | "embedding" | "indexing",
 *   status: "started" | "completed" | "failed",
 *   error?: string,
 *   totalChunks?: number,
 *   chunks?: { chunkIndex, content, sectionTitle, pageNumber, embeddingId }[]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-webhook-secret");
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { docId, stage, status, error, totalChunks, chunks } = body as {
      docId: string;
      stage: string;
      status: "started" | "completed" | "failed";
      error?: string;
      totalChunks?: number;
      chunks?: {
        chunkIndex: number;
        content: string;
        sectionTitle: string;
        pageNumber: number;
        embeddingId: string;
      }[];
    };

    if (!docId || !stage || !status) {
      return NextResponse.json(
        { error: "docId, stage, and status are required" },
        { status: 400 }
      );
    }

    // Look up document by file hash (docId = SHA-256 hash)
    const doc = await getDocumentByHash(docId);
    if (!doc) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Get or create the processing job for this stage
    let job = await getJobByDocAndStage(doc.id, stage);
    if (!job) {
      job = await createJob(doc.tenantId, doc.id, stage);
    }

    if (status === "started") {
      await startJob(job.id);
      await updateDocumentStatus(docId, "processing");
    } else if (status === "completed") {
      await completeJob(job.id);

      // If this is the final indexing stage, mark document as indexed
      if (stage === "indexing") {
        await updateDocumentStatus(docId, "indexed", { totalChunks });
      }

      // Store chunk data if provided
      if (chunks && chunks.length > 0 && doc.id) {
        await storeChunks(doc.id, doc.tenantId, chunks);
      }
    } else if (status === "failed") {
      await failJob(job.id, error ?? "Unknown error");
      await updateDocumentStatus(docId, "failed", {
        errorMessage: error ?? "Unknown error",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook/processing] error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
