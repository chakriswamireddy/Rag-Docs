/**
 * AWS SQS message sender for the Cloudflare Worker.
 *
 * Uses aws4fetch (SigV4 over Web Crypto) — no AWS SDK needed in Workers.
 *
 * Supports both standard queues and FIFO queues (.fifo suffix).
 * FIFO queues use docId as MessageDeduplicationId for exactly-once delivery.
 *
 * Message schema:
 * {
 *   docId:      string,  // SHA-256 content hash — primary idempotency key
 *   fileUrl:    string,  // R2 public or presigned URL
 *   fileName:   string,
 *   uploadedAt: string   // ISO 8601
 * }
 */

import { AwsClient } from "aws4fetch";
import type { Env } from "./index";
import type { UploadQueueMessage } from "../../../shared/types";

export async function sendSQSMessage(
  message: UploadQueueMessage,
  env: Env
): Promise<void> {
  const isFifo = env.SQS_QUEUE_URL.endsWith(".fifo");

  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
    service: "sqs",
  });

  const params = new URLSearchParams({
    Action: "SendMessage",
    MessageBody: JSON.stringify(message),
    Version: "2012-11-05",
  });

  // FIFO queues require deduplication and group IDs
  if (isFifo) {
    params.set("MessageDeduplicationId", message.docId);
    params.set("MessageGroupId", "pdf-processing");
  }

  const res = await aws.fetch(env.SQS_QUEUE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SQS SendMessage failed (${res.status}): ${body}`);
  }
}
