/**
 * Recreate the Pinecone index with the correct embedding dimension.
 *
 * The embedding model used throughout this app — `@cf/baai/bge-small-en-v1.5`
 * (see shared/embeddings.ts and the Worker's embedder) — produces 384-dim
 * vectors. If the index was created with a different dimension (e.g. 1024),
 * every upsert fails with:
 *   "Vector dimension 384 does not match the dimension of the index 1024"
 *
 * This script checks the index dimension and, if it differs, deletes and
 * recreates it at 384 dims (reusing the existing cloud/region/metric). The
 * index holds no usable vectors in this state, so nothing is lost.
 *
 * Run: npx tsx scripts/fix-pinecone-index.ts
 * Requires: PINECONE_API_KEY, PINECONE_INDEX_NAME
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Pinecone } from "@pinecone-database/pinecone";

const EXPECTED_DIM = 384; // @cf/baai/bge-small-en-v1.5

async function main() {
  const apiKey = process.env.PINECONE_API_KEY;
  const name = process.env.PINECONE_INDEX_NAME;
  if (!apiKey) throw new Error("PINECONE_API_KEY is required");
  if (!name) throw new Error("PINECONE_INDEX_NAME is required");

  const pc = new Pinecone({ apiKey });

  const existing = await pc.describeIndex(name).catch(() => null);

  if (existing && existing.dimension === EXPECTED_DIM) {
    console.log(
      `✅ Index "${name}" already has dimension ${EXPECTED_DIM}. Nothing to do.`
    );
    return;
  }

  // Reuse the existing cloud/region/metric when present; otherwise default to a
  // serverless index on AWS us-east-1 with cosine similarity.
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

  if (existing) {
    console.log(
      `⚠️  Index "${name}" has dimension ${existing.dimension}; recreating at ${EXPECTED_DIM}...`
    );
    await pc.deleteIndex(name);
    // Wait for the name to be released before recreating.
    for (let i = 0; i < 30; i++) {
      const list = await pc.listIndexes();
      if (!list.indexes?.some((idx) => idx.name === name)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } else {
    console.log(`ℹ️  Index "${name}" does not exist; creating at ${EXPECTED_DIM}...`);
  }

  await pc.createIndex({
    name,
    dimension: EXPECTED_DIM,
    metric,
    spec: { serverless: { cloud, region } },
    waitUntilReady: true,
  });

  console.log(`✅ Index "${name}" is ready with dimension ${EXPECTED_DIM} (metric: ${metric}).`);
  console.log("   Re-upload your documents — they will now index successfully.");
}

main().catch((err) => {
  console.error("❌ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
