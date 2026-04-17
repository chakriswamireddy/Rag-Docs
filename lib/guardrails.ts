/**
 * Hallucination guardrail.
 *
 * Runs a second lightweight Groq call after the main answer is generated.
 * It asks the model whether each claim in the answer is supported by the
 * retrieved chunks and returns a structured result the caller can use to
 * decide whether to surface a warning or retry.
 */
import Groq from "groq-sdk";
import type { ScoredDocument } from "./retriever";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

export type VerificationResult = {
  isGrounded: boolean;
  /** 0 = definitely hallucinated, 1 = fully grounded */
  confidence: number;
  /** Specific claims that could not be traced back to any chunk. */
  unsupportedClaims: string[];
};

const VERIFY_PROMPT = `You are a factual grounding checker. Given source passages and an answer, identify any claims in the answer that are NOT supported by the passages.

Rules:
- Only flag claims that are specific (numbers, names, dates, technical facts).
- Ignore general statements, restatements of the question, or transitional phrases.
- Return ONLY valid JSON — no markdown, no explanation.

Format:
{"isGrounded":true|false,"confidence":0.0-1.0,"unsupportedClaims":["<claim>","..."]}`;

/**
 * Verify whether `answer` is grounded in `chunks`.
 * Falls back to `{ isGrounded: true, confidence: 1, unsupportedClaims: [] }`
 * on any error so a verification failure never blocks the response.
 */
export async function verifyAnswer(
  answer: string,
  chunks: ScoredDocument[]
): Promise<VerificationResult> {
  const safe: VerificationResult = {
    isGrounded: true,
    confidence: 1,
    unsupportedClaims: [],
  };

  if (!answer || chunks.length === 0) return safe;

  const passages = chunks
    .slice(0, 6)
    .map(
      (c, i) =>
        `[chunk-${i}] ${c.doc.pageContent.slice(0, 400)}`
    )
    .join("\n\n");

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: VERIFY_PROMPT },
        {
          role: "user",
          content: `Source passages:\n${passages}\n\nAnswer to verify:\n${answer}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 300,
    });

    const raw = res.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<VerificationResult>;

    return {
      isGrounded: parsed.isGrounded ?? true,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 1,
      unsupportedClaims: Array.isArray(parsed.unsupportedClaims)
        ? (parsed.unsupportedClaims as unknown[]).filter(
            (s): s is string => typeof s === "string"
          )
        : [],
    };
  } catch {
    return safe;
  }
}
