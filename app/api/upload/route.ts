/**
 * POST /api/upload
 *
 * 1. Accepts a multipart PDF upload.
 * 2. Generates a SHA-256 content-addressed docId.
 * 3. Stores the raw file in Cloudflare R2 or AWS S3 based on `storageProvider`.
 * 4. Dispatches metadata to the Cloudflare Worker for routing.
 * 5. Returns immediately — all processing is async.
 *
 * Required env vars:
 *   CF_WORKER_URL    – URL of the upload-router Cloudflare Worker
 *   CF_WORKER_SECRET – Shared secret validated by the Worker
 *
 * Optional form field:
 *   storageProvider  – "cloudflare" (default) | "aws"
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getR2FileUrl, uploadToR2 } from "@/lib/r2";
import { getS3FileUrl, uploadToS3 } from "@/lib/s3";

type StorageProvider = "cloudflare" | "aws";

export async function POST(req: NextRequest) {
  try {
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

    const providerField = formData.get("storageProvider");
    const storageProvider: StorageProvider =
      providerField === "aws" ? "aws" : "cloudflare";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Content-addressed ID — re-uploading the same file is idempotent
    const docId = crypto.createHash("sha256").update(buffer).digest("hex");

    // 1. Persist raw PDF to chosen storage
    let fileUrl: string;
    if (storageProvider === "aws") {
      await uploadToS3(docId, buffer);
      fileUrl = getS3FileUrl(docId);
    } else {
      await uploadToR2(docId, buffer);
      fileUrl = getR2FileUrl(docId);
    }

    // 2. Dispatch event to CF Worker (Worker decides small-inline vs SQS queue)
    if (!process.env.CF_WORKER_URL) {
      return NextResponse.json(
        { error: "CF_WORKER_URL is not configured" },
        { status: 500 }
      );
    }

    const workerRes = await fetch(process.env.CF_WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": process.env.CF_WORKER_SECRET ?? "",
      },
      body: JSON.stringify({
        docId,
        fileUrl,
        fileName: file.name,
        fileSize: buffer.byteLength,
        uploadedAt: new Date().toISOString(),
        storageProvider,
      }),
    });

    if (!workerRes.ok) {
      const detail = await workerRes.text();
      console.error("[upload] Worker dispatch error:", detail);
      return NextResponse.json(
        { error: "Processing dispatch failed", detail },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, docId, storageProvider });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] error:", message);
    return NextResponse.json(
      { error: "Upload failed", detail: message },
      { status: 500 }
    );
  }
}
