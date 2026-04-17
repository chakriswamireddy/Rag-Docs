/**
 * Query router.
 *
 * Combines classification with query rewriting to produce a RetrievalPlan
 * that tells downstream retrieval functions exactly what to fetch and how.
 */
import { classifyQuery, type QueryType } from "./query-classifier";

export type ConversationTurn = {
  question: string;
  answer: string;
};

export type RetrievalPlan = {
  type: QueryType;
  /** Primary query to use for retrieval (may be a rewritten / expanded version). */
  primaryQuery: string;
  /** Additional sub-queries for comparison / multi-hop routing. */
  subQueries: string[];
};

/**
 * Build a retrieval plan for the current question.
 * History is used for standalone-question rewriting in `lib/memory.ts`
 * (the router operates on an already-rewritten query).
 */
export async function buildRetrievalPlan(
  question: string
): Promise<RetrievalPlan> {
  const classification = await classifyQuery(question);

  return {
    type: classification.type,
    primaryQuery: question,
    subQueries: classification.subQueries,
  };
}
