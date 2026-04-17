/**
 * ReAct agent executor.
 *
 * Implements the Reasoning + Acting loop:
 *   Thought → Action(tool, input) → Observation → … → Final Answer
 *
 * The LLM is given a system prompt describing the available tools.  It must
 * respond in a structured format the executor can parse.  The loop runs for
 * at most MAX_ITERATIONS steps to prevent runaway usage.
 *
 * Export: `runAgent` — returns an async generator that yields each step so
 * the caller can stream progress to the client.
 */
import Groq from "groq-sdk";
import { TOOLS, getTool, formatToolsForPrompt } from "./tools";
import type { ConversationTurn } from "../router";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

/** Use a more capable model for agent reasoning. */
const AGENT_MODEL = process.env.GROQ_AGENT_MODEL ?? "llama-3.3-70b-versatile";

const MAX_ITERATIONS = 5;

export type AgentStep =
  | { type: "thought"; content: string }
  | { type: "action"; tool: string; input: Record<string, unknown> }
  | { type: "observation"; content: string }
  | { type: "answer"; content: string }
  | { type: "error"; content: string };

const SYSTEM_PROMPT = `You are a reasoning agent with access to the following tools:

${formatToolsForPrompt()}

You MUST respond in this exact format for each step:
Thought: <your reasoning>
Action: <tool_name>
Action Input: <JSON object matching the tool's input schema>

When you have enough information to answer, respond with:
Thought: I now have enough information.
Final Answer: <your complete answer with citations>

Rules:
- Always cite sources: "According to [page P, §Section]..."
- Only use information from tool observations — never invent facts.
- If tools return no useful data, say "Not found in document."
- You may call tools multiple times in sequence.`;

function parseStep(text: string): {
  thought?: string;
  action?: string;
  actionInput?: Record<string, unknown>;
  finalAnswer?: string;
} {
  // Match Thought: ... up to Action: or end-of-string (without dotAll flag for TS<es2018)
  const thoughtMatch = text.match(/Thought:\s*([\s\S]+?)(?=\nAction:|$)/);
  const actionMatch = text.match(/Action:\s*(\w+)/);
  const inputMatch = text.match(/Action Input:\s*(\{[\s\S]*?\})/);
  const finalMatch = text.match(/Final Answer:\s*([\s\S]+)/);

  let actionInput: Record<string, unknown> | undefined;
  if (inputMatch?.[1]) {
    try {
      actionInput = JSON.parse(inputMatch[1]) as Record<string, unknown>;
    } catch {
      // Malformed JSON — will be caught as an error observation
    }
  }

  return {
    thought: thoughtMatch?.[1]?.trim(),
    action: actionMatch?.[1]?.trim(),
    actionInput,
    finalAnswer: finalMatch?.[1]?.trim(),
  };
}

/**
 * Run the ReAct agent loop and yield steps as they occur.
 * The final step will have `type === "answer"` or `type === "error"`.
 */
export async function* runAgent(
  question: string,
  history: ConversationTurn[] = []
): AsyncGenerator<AgentStep> {
  const historyMessages: Groq.Chat.ChatCompletionMessageParam[] = history
    .slice(-4)
    .flatMap((t) => [
      { role: "user" as const, content: t.question },
      { role: "assistant" as const, content: t.answer },
    ]);

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMessages,
    { role: "user", content: question },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let llmText = "";

    try {
      const res = await groq.chat.completions.create({
        model: AGENT_MODEL,
        messages,
        temperature: 0,
        max_tokens: 1000,
        stop: ["Observation:"],
      });
      llmText = res.choices[0]?.message?.content ?? "";
    } catch (err) {
      yield {
        type: "error",
        content: `LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      return;
    }

    const parsed = parseStep(llmText);

    if (parsed.thought) {
      yield { type: "thought", content: parsed.thought };
    }

    if (parsed.finalAnswer) {
      yield { type: "answer", content: parsed.finalAnswer };
      return;
    }

    if (!parsed.action) {
      // No structured output — treat the whole response as the final answer
      yield { type: "answer", content: llmText.trim() };
      return;
    }

    const tool = getTool(parsed.action);

    if (!tool) {
      const obs = `Tool "${parsed.action}" not found. Available: ${TOOLS.map((t) => t.name).join(", ")}`;
      yield { type: "action", tool: parsed.action, input: parsed.actionInput ?? {} };
      yield { type: "observation", content: obs };
      messages.push({ role: "assistant", content: llmText });
      messages.push({ role: "user", content: `Observation: ${obs}` });
      continue;
    }

    if (!parsed.actionInput) {
      const obs = `Could not parse Action Input JSON for tool "${parsed.action}".`;
      yield { type: "action", tool: parsed.action, input: {} };
      yield { type: "observation", content: obs };
      messages.push({ role: "assistant", content: llmText });
      messages.push({ role: "user", content: `Observation: ${obs}` });
      continue;
    }

    yield { type: "action", tool: parsed.action, input: parsed.actionInput };

    const result = await tool.run(parsed.actionInput);
    const obsText = result.ok
      ? JSON.stringify(result.data, null, 2)
      : `Error: ${result.error}`;

    yield { type: "observation", content: obsText };

    messages.push({ role: "assistant", content: llmText });
    messages.push({ role: "user", content: `Observation: ${obsText}` });
  }

  // Exceeded max iterations
  yield {
    type: "error",
    content: "Agent exceeded maximum iterations without reaching a final answer.",
  };
}
