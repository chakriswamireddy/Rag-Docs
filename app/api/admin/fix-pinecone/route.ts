/**
 * One-shot admin endpoint to fix the Pinecone index dimension.
 *
 * The embedding model (@cf/baai/bge-small-en-v1.5) produces 384-dim vectors.
 * If the index was created at a different dimension (e.g. 1024), every upsert
 * fails with "Vector dimension 384 does not match the dimension of the index".
 *
 * Auth: Authorization: Bearer <ADMIN_SECRET>
 * Method: POST /api/admin/fix-pinecone
 *
 * Returns 200 when already correct, 202 when recreating (index not yet ready),
 * 401 on bad auth, 500 on unexpected errors.
 */
import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";

export const maxDuration = 60; // seconds — requires Vercel Pro; hobby caps at 10s

const EXPECTED_DIM = 384;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  // Auth guard
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET env var not set" },
      { status: 500 }
    );
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${adminSecret}`) {
    return unauthorized();
  }

  const apiKey = process.env.PINECONE_API_KEY;
  const indexName = process.env.PINECONE_INDEX_NAME;
  if (!apiKey || !indexName) {
    return NextResponse.json(
      { error: "PINECONE_API_KEY or PINECONE_INDEX_NAME env var not set" },
      { status: 500 }
    );
  }

  const pc = new Pinecone({ apiKey });

  try {
    const existing = await pc.describeIndex(indexName).catch(() => null);

    if (existing?.dimension === EXPECTED_DIM) {
      return NextResponse.json({
        fixed: false,
        message: `Index "${indexName}" already has dimension ${EXPECTED_DIM}. Nothing to do.`,
        dim: EXPECTED_DIM,
      });
    }

    // Extract cloud/region/metric to reuse when recreating.
    const metric = (existing?.metric ?? "cosine") as
      | "cosine"
      | "euclidean"
      | "dotproduct";
    const existingServerless =
      existing?.spec && "serverless" in existing.spec
        ? existing.spec.serverless
        : undefined;
    const cloud = (existingServerless?.cloud ?? "aws") as "aws" | "gcp" | "azure";
    const region = existingServerless?.region ?? "us-east-1";
    const oldDim = existing?.dimension ?? null;

    if (existing) {
      await pc.deleteIndex(indexName);
      // Brief pause to let Pinecone release the name before recreating.
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Create without waitUntilReady to avoid Vercel function timeout on hobby plan.
    // The index will be ready in ~30-60 seconds.
    await pc.createIndex({
      name: indexName,
      dimension: EXPECTED_DIM,
      metric,
      spec: { serverless: { cloud, region } },
      waitUntilReady: false,
    });

    return NextResponse.json(
      {
        fixed: true,
        oldDim,
        newDim: EXPECTED_DIM,
        message: `Index "${indexName}" is being recreated at ${EXPECTED_DIM} dims. Wait ~60 seconds before uploading.`,
      },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
