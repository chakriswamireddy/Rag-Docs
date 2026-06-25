/**
 * POST /api/upload
 *
 * 1. Accepts a multipart PDF upload (size-capped per role).
 * 2. Generates a SHA-256 content-addressed docId.
 * 3. Stores the raw file in Cloudflare R2 or AWS S3 based on `storageProvider`.
 * 4. Indexes the PDF synchronously (parse → embed → Pinecone + Postgres) and
 *    returns once the document is queryable. See lib/pdf-indexer.ts.
 *
 * Optional form field:
 *   storageProvider  – "cloudflare" (default) | "aws"
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getR2FileUrl, uploadToR2 } from "@/lib/r2";
import { getS3FileUrl, uploadToS3 } from "@/lib/s3";
import { auth } from "@/lib/auth";
import { createDocument } from "@/lib/services/document.service";
import { indexPdfBuffer } from "@/lib/pdf-indexer";
import { checkUploadLimit } from "@/lib/rate-limit";

type StorageProvider = "cloudflare" | "aws";

// Test accounts are deliberately constrained: 1 MB cap, Cloudflare R2 only.
const TEST_USER_MAX_BYTES = 1 * 1024 * 1024;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? null;
    const userId = session?.user?.id ?? null;
    const isTestUser = session?.user?.role === "test";

    // Rate limit uploads
    if (tenantId) {
      const limit = checkUploadLimit(tenantId);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Upload rate limit exceeded" },
          { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } }
        );
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    // Test users may only use Cloudflare R2; real users keep the toggle.
    const providerField = formData.get("storageProvider");
    const storageProvider: StorageProvider = isTestUser
      ? "cloudflare"
      : providerField === "aws"
        ? "aws"
        : "cloudflare";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Enforce the upload size limit server-side (1 MB for test users, 3 MB otherwise)
    const maxBytes = isTestUser ? TEST_USER_MAX_BYTES : DEFAULT_MAX_BYTES;
    if (buffer.byteLength > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      return NextResponse.json(
        { error: `File exceeds the ${maxMb} MB limit.` },
        { status: 413 }
      );
    }

    // Content-addressed ID — re-uploading the same file is idempotent
    const docId = crypto.createHash("sha256").update(buffer).digest("hex");

    // 1. Persist raw PDF to chosen storage
    let fileUrl: string;
    if (storageProvider === "aws") {
      await uploadToS3(tenantId, docId, buffer);
      fileUrl = getS3FileUrl(tenantId, docId);
    } else {
      await uploadToR2(tenantId, docId, buffer);
      fileUrl = getR2FileUrl(tenantId, docId);
    }

    // 2. Record in database
    const doc = await createDocument({
      tenantId,
      userId,
      fileName: file.name,
      fileUrl,
      fileHash: docId,
      fileSize: buffer.byteLength,
      mimeType: "application/pdf",
    });

    // 3. Index synchronously — parse, embed and upsert right here. The file is
    //    already in memory and capped at a few MB, so there is no need for the
    //    external Worker + webhook round-trip (which left documents stuck at
    //    "uploaded" when the Worker wasn't reachable).
    const uploadedAt = new Date().toISOString();
    const result = await indexPdfBuffer({
      buffer,
      docId,
      documentId: doc.id,
      fileName: file.name ?? "document.pdf",
      tenantId,
      uploadedAt,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: "Indexing failed", detail: result.error },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      docId,
      storageProvider,
      totalChunks: result.totalChunks,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] error:", message);
    return NextResponse.json(
      { error: "Upload failed", detail: message },
      { status: 500 }
    );
  }
}
