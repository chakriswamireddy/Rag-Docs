import { getDb } from "@/lib/db";
import { processingJobs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function createJob(
  tenantId: string | null,
  documentId: string,
  stage: string
) {
  const db = getDb();
  const [job] = await db
    .insert(processingJobs)
    .values({
      tenantId,
      documentId,
      stage,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
    })
    .returning();
  return job;
}

export async function startJob(jobId: string) {
  const db = getDb();
  const [updated] = await db
    .update(processingJobs)
    .set({
      status: "processing",
      startedAt: new Date(),
      attempts: 1,
    })
    .where(eq(processingJobs.id, jobId))
    .returning();
  return updated ?? null;
}

export async function completeJob(jobId: string) {
  const db = getDb();
  const [updated] = await db
    .update(processingJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(processingJobs.id, jobId))
    .returning();
  return updated ?? null;
}

export async function failJob(jobId: string, errorMessage: string) {
  const db = getDb();

  // Get current job to check attempts
  const [current] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (!current) return null;

  const newAttempts = (current.attempts ?? 0) + 1;
  const maxAttempts = current.maxAttempts ?? 3;

  const [updated] = await db
    .update(processingJobs)
    .set({
      status: newAttempts >= maxAttempts ? "failed" : "pending",
      attempts: newAttempts,
      errorMessage,
    })
    .where(eq(processingJobs.id, jobId))
    .returning();

  return updated ?? null;
}

export async function shouldRetry(jobId: string): Promise<boolean> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.id, jobId))
    .limit(1);

  if (!job) return false;
  return (job.attempts ?? 0) < (job.maxAttempts ?? 3);
}

export async function getJobsByDocument(documentId: string) {
  const db = getDb();
  return db
    .select()
    .from(processingJobs)
    .where(eq(processingJobs.documentId, documentId))
    .orderBy(processingJobs.createdAt);
}

export async function getJobByDocAndStage(documentId: string, stage: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.documentId, documentId),
        eq(processingJobs.stage, stage)
      )
    )
    .limit(1);
  return job ?? null;
}
