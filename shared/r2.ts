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

export function getDocumentKey(docId: string) {
  return `documents/${docId}.pdf`;
}

export function getR2FileUrl(docId: string) {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) {
    throw new Error("R2_PUBLIC_URL is required");
  }
  return `${base.replace(/\/$/, "")}/${getDocumentKey(docId)}`;
}

export async function uploadPdfToR2(docId: string, body: Buffer) {
  const key = getDocumentKey(docId);
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

export async function fetchPdfFromR2(docId: string): Promise<Buffer> {
  const object = await r2.send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: getDocumentKey(docId),
    })
  );

  const chunks: Buffer[] = [];
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
