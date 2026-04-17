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

export function getDocumentKey(docId: string) {
  return `documents/${docId}.pdf`;
}

export function getS3FileUrl(docId: string) {
  const base = process.env.AWS_S3_PUBLIC_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/${getDocumentKey(docId)}`;
  }
  const bucket = getBucketName();
  const region = process.env.AWS_REGION ?? "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${getDocumentKey(docId)}`;
}

export async function uploadPdfToS3(docId: string, body: Buffer) {
  const key = getDocumentKey(docId);
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

export async function fetchPdfFromS3(docId: string): Promise<Buffer> {
  const object = await s3.send(
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
