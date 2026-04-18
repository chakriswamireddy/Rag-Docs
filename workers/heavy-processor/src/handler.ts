import type { SQSEvent, SQSRecord } from "aws-lambda";
import { extractText } from "unpdf";
import { embedTexts } from "../../../shared/embeddings";
import { fetchPdfFromR2 } from "../../../shared/r2";
import { namespaceVectorCount, upsertChunkRecords } from "../../../shared/pinecone";
import type { ChunkRecord, UploadQueueMessage } from "../../../shared/types";

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 80;

function splitWithOverlap(text: string) {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + CHUNK_SIZE);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function parseMessage(record: SQSRecord): UploadQueueMessage {
  const data = JSON.parse(record.body) as UploadQueueMessage;
  if (!data.docId || !data.fileName || !data.uploadedAt) {
    throw new Error("Invalid SQS message payload");
  }
  return data;
}

async function buildChunkRecords(
  docId: string,
  tenantId: string | null | undefined,
  fileName: string,
  uploadedAt: string
) {
  const pdfBuffer = await fetchPdfFromR2(tenantId ?? null, docId);
  const { text } = await extractText(new Uint8Array(pdfBuffer), { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  const rows: Array<{ page: number; text: string }> = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageText = String(pages[pageIndex] ?? "").trim();
    if (!pageText) continue;
    for (const chunk of splitWithOverlap(pageText)) {
      rows.push({ page: pageIndex + 1, text: chunk });
    }
  }

  const vectors = await embedTexts(rows.map((r) => r.text));

  return rows.map((row, chunkIndex): ChunkRecord => ({
    id: `${docId}-${chunkIndex}`,
    values: vectors[chunkIndex],
    metadata: {
      docId,
      page: row.page,
      chunkIndex,
      text: row.text,
      source: fileName,
      uploadedAt,
    },
  }));
}

async function processRecord(record: SQSRecord) {
  const message = parseMessage(record);
  const namespace = message.docId;

  const existing = await namespaceVectorCount(namespace);
  if (existing > 0) {
    console.log(`[lambda] ${namespace} already indexed, skipping`);
    return;
  }

  const chunkRecords = await buildChunkRecords(
    message.docId,
    message.tenantId,
    message.fileName,
    message.uploadedAt
  );

  if (chunkRecords.length === 0) {
    console.warn(`[lambda] ${namespace} produced zero chunks`);
    return;
  }

  await upsertChunkRecords(chunkRecords, namespace);
  console.log(`[lambda] ${namespace} indexed ${chunkRecords.length} chunks`);
}

export const handler = async (event: SQSEvent) => {
  const failures: { itemIdentifier: string }[] = [];

  await Promise.all(
    event.Records.map(async (record) => {
      try {
        await processRecord(record);
      } catch (error) {
        console.error(`[lambda] failed record ${record.messageId}:`, error);
        failures.push({ itemIdentifier: record.messageId });
      }
    })
  );

  return { batchItemFailures: failures };
};
