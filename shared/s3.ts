import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function createS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
    },
  });
}

const s3 = createS3Client();

function getBucketName() {
  if (!process.env.AWS_S3_BUCKET_NAME) {
    throw new Error("AWS_S3_BUCKET_NAME is required");
  }
  return process.env.AWS_S3_BUCKET_NAME;
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

export function getS3FileUrl(tenantId: string | null, docId: string): string {
  const base = process.env.AWS_S3_PUBLIC_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/${getDocumentKey(tenantId, docId)}`;
  }
  const bucket = getBucketName();
  const region = process.env.AWS_REGION ?? "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${getDocumentKey(tenantId, docId)}`;
}

export async function uploadPdfToS3(tenantId: string | null, docId: string, body: Buffer): Promise<string> {
  const key = getDocumentKey(tenantId, docId);
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: "application/pdf",
    })
  );
  return key;
}

export async function fetchPdfFromS3(tenantId: string | null, docId: string): Promise<Buffer> {
  const primaryKey = getDocumentKey(tenantId, docId);
  try {
    const object = await s3.send(
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
      const object = await s3.send(
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
