/**
 * R2 file fetcher for the Cloudflare Worker.
 *
 * Uses aws4fetch (Web Crypto–based SigV4) to sign S3-compatible requests
 * against the R2 endpoint — no Node.js SDK required.
 */

import { AwsClient } from "aws4fetch";
import type { Env } from "./index";

export async function fetchFromR2(docId: string, env: Env): Promise<ArrayBuffer> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    // R2 uses "auto" region
    region: "auto",
    service: "s3",
  });

  const url = `${env.R2_ENDPOINT}/${env.R2_BUCKET_NAME}/documents/${docId}.pdf`;
  const res = await client.fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`R2 GET failed (${res.status}): ${body}`);
  }

  return res.arrayBuffer();
}
