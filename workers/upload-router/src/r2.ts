/**
 * R2 file fetcher for the Cloudflare Worker.
 *
 * Uses aws4fetch (Web Crypto–based SigV4) to sign S3-compatible requests
 * against the R2 endpoint — no Node.js SDK required.
 *
 * Key structure: {env}/tenants/{tenantId}/documents/{docId}/original/original.pdf
 * Falls back to the legacy key (documents/{docId}.pdf) for pre-migration files.
 */

import { AwsClient } from "aws4fetch";
import type { Env } from "./index";

function buildR2Url(env: Env, key: string): string {
  return `${env.R2_ENDPOINT}/${env.R2_BUCKET_NAME}/${key}`;
}

function getPrimaryKey(env: Env, tenantId: string | null | undefined, docId: string): string {
  const storageEnv = env.STORAGE_ENV ?? "production";
  const tenant = tenantId ?? "_unassigned";
  return `${storageEnv}/tenants/${tenant}/documents/${docId}/original/original.pdf`;
}

function getLegacyKey(docId: string): string {
  return `documents/${docId}.pdf`;
}

export async function fetchFromR2(
  docId: string,
  env: Env,
  tenantId?: string | null
): Promise<ArrayBuffer> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: "auto",
    service: "s3",
  });

  const primaryUrl = buildR2Url(env, getPrimaryKey(env, tenantId, docId));
  const res = await client.fetch(primaryUrl);

  if (res.ok) {
    return res.arrayBuffer();
  }

  // Fall back to the legacy key for files uploaded before the storage migration
  if (res.status === 404) {
    const legacyUrl = buildR2Url(env, getLegacyKey(docId));
    const legacyRes = await client.fetch(legacyUrl);
    if (!legacyRes.ok) {
      const body = await legacyRes.text();
      throw new Error(`R2 GET failed (${legacyRes.status}): ${body}`);
    }
    return legacyRes.arrayBuffer();
  }

  const body = await res.text();
  throw new Error(`R2 GET failed (${res.status}): ${body}`);
}
