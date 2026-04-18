import { getDb } from "@/lib/db";
import { evaluations, evaluationResults } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { askQuestion } from "@/lib/rag";

export async function createEvalCase(
  tenantId: string,
  question: string,
  expectedAnswer: string
) {
  const db = getDb();
  const [evalCase] = await db
    .insert(evaluations)
    .values({ tenantId, question, expectedAnswer })
    .returning();
  return evalCase;
}

export async function listEvalCases(tenantId: string) {
  const db = getDb();
  return db
    .select()
    .from(evaluations)
    .where(eq(evaluations.tenantId, tenantId))
    .orderBy(desc(evaluations.createdAt));
}

export async function deleteEvalCase(id: string) {
  const db = getDb();
  const [deleted] = await db
    .delete(evaluations)
    .where(eq(evaluations.id, id))
    .returning({ id: evaluations.id });
  return deleted ?? null;
}

/** Tokenize for F1 scoring. */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z0-9]+\b/g) ?? [];
}

/** Token-overlap F1 score. */
function f1Score(expected: string, actual: string): number {
  const expTokens = new Set(tokenize(expected));
  const actTokens = new Set(tokenize(actual));
  if (expTokens.size === 0 || actTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of actTokens) if (expTokens.has(t)) overlap++;

  const precision = overlap / actTokens.size;
  const recall = overlap / expTokens.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Check if expected answer appears as substring. */
function exactMatch(expected: string, actual: string): boolean {
  return actual.toLowerCase().includes(expected.toLowerCase());
}

/**
 * Run all evaluation cases for a tenant.
 * Calls askQuestion for each case, scores the result, writes to DB.
 */
export async function runEvaluation(tenantId: string) {
  const db = getDb();
  const cases = await listEvalCases(tenantId);

  const results: {
    evaluationId: string;
    question: string;
    expectedAnswer: string;
    actualAnswer: string | null;
    retrievedCorrect: boolean;
    answerCorrect: boolean;
    f1: number;
  }[] = [];

  for (const evalCase of cases) {
    if (!evalCase.question || !evalCase.expectedAnswer) continue;

    try {
      const response = await askQuestion(evalCase.question, [], { tenantId });

      const actual = response.answer ?? "";
      const isExact = exactMatch(evalCase.expectedAnswer, actual);
      const f1 = f1Score(evalCase.expectedAnswer, actual);
      const isGrounded = response.verification?.isGrounded ?? true;

      const [result] = await db
        .insert(evaluationResults)
        .values({
          evaluationId: evalCase.id,
          retrievedCorrect: isGrounded,
          answerCorrect: isExact,
          score: f1,
        })
        .returning();

      results.push({
        evaluationId: evalCase.id,
        question: evalCase.question,
        expectedAnswer: evalCase.expectedAnswer,
        actualAnswer: actual,
        retrievedCorrect: isGrounded,
        answerCorrect: isExact,
        f1,
      });
    } catch (err) {
      console.error(`[eval] Failed for case ${evalCase.id}:`, err);
      results.push({
        evaluationId: evalCase.id,
        question: evalCase.question ?? "",
        expectedAnswer: evalCase.expectedAnswer ?? "",
        actualAnswer: null,
        retrievedCorrect: false,
        answerCorrect: false,
        f1: 0,
      });
    }
  }

  const scored = results.filter((r) => r.actualAnswer !== null);
  const avgF1 = scored.length > 0
    ? scored.reduce((s, r) => s + r.f1, 0) / scored.length
    : 0;
  const exactMatchRate = scored.length > 0
    ? scored.filter((r) => r.answerCorrect).length / scored.length
    : 0;

  return {
    totalCases: cases.length,
    scoredCases: scored.length,
    avgF1: Math.round(avgF1 * 1000) / 1000,
    exactMatchRate: Math.round(exactMatchRate * 1000) / 1000,
    results,
  };
}

export async function getEvalResults(tenantId: string) {
  const db = getDb();
  const cases = await listEvalCases(tenantId);

  const allResults = [];
  for (const evalCase of cases) {
    const results = await db
      .select()
      .from(evaluationResults)
      .where(eq(evaluationResults.evaluationId, evalCase.id))
      .orderBy(desc(evaluationResults.createdAt))
      .limit(1);

    allResults.push({
      evaluation: evalCase,
      latestResult: results[0] ?? null,
    });
  }

  const scored = allResults.filter((r) => r.latestResult);
  const avgF1 = scored.length > 0
    ? scored.reduce((s, r) => s + (r.latestResult?.score ?? 0), 0) / scored.length
    : 0;
  const exactMatchRate = scored.length > 0
    ? scored.filter((r) => r.latestResult?.answerCorrect).length / scored.length
    : 0;

  return {
    totalCases: cases.length,
    scoredCases: scored.length,
    avgF1: Math.round(avgF1 * 1000) / 1000,
    exactMatchRate: Math.round(exactMatchRate * 1000) / 1000,
    results: allResults,
  };
}
