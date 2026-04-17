/**
 * Conversation memory helper.
 *
 * Rewrites a follow-up question into a fully self-contained question so that
 * retrieval doesn't depend on remembering what was said earlier in the chat.
 *
 * Example:
 *   Turn 1: "What is the invoice total?"  → "What is the invoice total?"
 *   Turn 2: "And the tax?"               → "What is the tax amount on the invoice?"
 */
import Groq from "groq-sdk";
import type { ConversationTurn } from "./router";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

const REWRITE_PROMPT = `Given the conversation history and a follow-up question, rewrite the follow-up as a complete, self-contained question that can be understood without the history.

Rules:
- If the follow-up is already self-contained, return it unchanged.
- Resolve pronouns ("it", "that", "they") using context from history.
- Keep the question concise.
- Respond with ONLY the rewritten question — no explanation, no quotes.`;

/**
 * Rewrite `question` as a standalone question using prior conversation turns.
 * Returns the original question unchanged when there is no history.
 */
export async function rewriteWithContext(
  question: string,
  history: ConversationTurn[]
): Promise<string> {
  if (history.length === 0) return question;

  const historyText = history
    .slice(-4) // last 4 turns is sufficient context
    .map((t, i) => `Turn ${i + 1}\nQ: ${t.question}\nA: ${t.answer}`)
    .join("\n\n");

  try {
    const res = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: REWRITE_PROMPT },
        {
          role: "user",
          content: `History:\n${historyText}\n\nFollow-up question: ${question}`,
        },
      ],
      temperature: 0,
      max_tokens: 150,
    });

    const rewritten = res.choices[0]?.message?.content?.trim();
    return rewritten && rewritten.length > 0 ? rewritten : question;
  } catch {
    // On any error fall back to the original question
    return question;
  }
}
