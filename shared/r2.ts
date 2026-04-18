import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function createR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: false,
  });
}

const r2 = createR2Client();

function getBucketName() {
  if (!process.env.R2_BUCKET_NAME) {
    throw new Error("R2_BUCKET_NAME is required");
  }
  return process.env.R2_BUCKET_NAME;
}

function storageEnv(): string {
  return process.env.STORAGE_ENV ?? process.env.NODE_ENV ?? "development";
}

/**
 * Primary storage key: {env}/tenants/{tenantId}/documents/{docId}/original/original.pdf
 * Uses tenantId and docId (both immutable IDs) — no names in the path.
 */
export function getDocumentKey(tenantId: string | null, docId: string): string {
  const tenant = tenantId ?? "_unassigned";
  return `${storageEnv()}/tenants/${tenant}/documents/${docId}/original/original.pdf`;
}

/** Legacy key for files uploaded before the storage migration. */
export function getLegacyDocumentKey(docId: string): string {
  return `documents/${docId}.pdf`;
}

/** Key for processed artifacts (e.g. "extracted.json", "chunks.json"). */
export function getProcessedKey(tenantId: string | null, docId: string, filename: string): string {
  const tenant = tenantId ?? "_unassigned";
  return `${storageEnv()}/tenants/${tenant}/documents/${docId}/processed/${filename}`;
}

/** Key for document-level metadata. */
export function getMetadataKey(tenantId: string | null, docId: string): string {
  const tenant = tenantId ?? "_unassigned";
  return `${storageEnv()}/tenants/${tenant}/documents/${docId}/metadata/meta.json`;
}

export function getR2FileUrl(tenantId: string | null, docId: string): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) {
    throw new Error("R2_PUBLIC_URL is required");
  }
  return `${base.replace(/\/$/, "")}/${getDocumentKey(tenantId, docId)}`;
}

export async function uploadPdfToR2(tenantId: string | null, docId: string, body: Buffer): Promise<string> {
  const key = getDocumentKey(tenantId, docId);
  await r2.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    })
  );
  return key;
}

export async function fetchPdfFromR2(tenantId: string | null, docId: string): Promise<Buffer> {
  const primaryKey = getDocumentKey(tenantId, docId);
  try {
    const object = await r2.send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: primaryKey,
      })
    );
    const chunks: Buffer[] = [];
    for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch (err: unknown) {
    // Fall back to the legacy key for files uploaded before the storage migration
    const code = (err as { Code?: string; name?: string })?.Code ?? (err as { name?: string })?.name;
    if (code === "NoSuchKey") {
      const legacyKey = getLegacyDocumentKey(docId);
      const object = await r2.send(
        new GetObjectCommand({
          Bucket: getBucketName(),
          Key: legacyKey,
        })
      );
      const chunks: Buffer[] = [];
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    throw err;
  }
}
