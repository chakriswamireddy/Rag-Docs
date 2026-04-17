/**
 * Agent tools.
 *
 * Each tool is a simple async function with a name, description, and a JSON
 * schema for its input.  The ReAct executor uses the description + schema to
 * build a system prompt that tells the LLM which tools are available and how
 * to call them.
 *
 * Tools defined here:
 *  1. retriever      – hybrid BM25 + Pinecone search
 *  2. calculator     – evaluate safe arithmetic expressions (no eval)
 *  3. metadata_filter – filter already-retrieved docs by page / section / source
 */
import { hybridRetrieve, type ScoredDocument } from "../retriever";

// ── Tool type definitions ──────────────────────────────────────────────────

export type ToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type Tool = {
  name: string;
  description: string;
  /** JSON schema (simplified) for the LLM to understand input shape. */
  inputSchema: Record<string, string>;
  run(input: Record<string, unknown>): Promise<ToolResult>;
};

// ── 1. Retriever tool ───────────────────────────────────────────────────────

const retrieverTool: Tool = {
  name: "retriever",
  description:
    "Search the indexed document for passages relevant to a query. " +
    "Returns the top matching passages with page and section metadata.",
  inputSchema: {
    query: "string — the search query",
    k: "number (optional) — max results, default 6",
  },
  async run(input) {
    const query = String(input.query ?? "");
    const k = typeof input.k === "number" ? Math.min(input.k, 20) : 6;
    if (!query) return { ok: false, error: "query is required" };
    const docs = await hybridRetrieve(query, k);
    return {
      ok: true,
      data: docs.map((d) => ({
        content: d.doc.pageContent,
        page: d.doc.metadata?.page,
        section: d.doc.metadata?.section,
        score: d.score,
      })),
    };
  },
};

// ── 2. Calculator tool ──────────────────────────────────────────────────────

/**
 * Safe arithmetic evaluator.  Accepts expressions like "120.5 * 0.18" or
 * "(3200 - 2800) / 2800 * 100".  Only digits, operators, parentheses,
 * and dots are allowed — no identifiers, no function calls.
 */
function safeEval(expr: string): number {
  if (!/^[\d\s+\-*/().%]+$/.test(expr)) {
    throw new Error("Expression contains disallowed characters");
  }
  // Use Function constructor with no global scope — minimal attack surface.
  // Input is already validated to contain only numbers and operators.
  return new Function(`"use strict"; return (${expr})`)() as number;
}

const calculatorTool: Tool = {
  name: "calculator",
  description:
    "Evaluate an arithmetic expression and return the numeric result. " +
    "Use this when the user asks for calculations on numbers found in the document.",
  inputSchema: {
    expression:
      'string — arithmetic expression, e.g. "3200 - 2800" or "(120 * 1.18)"',
  },
  async run(input) {
    const expr = String(input.expression ?? "").trim();
    if (!expr) return { ok: false, error: "expression is required" };
    try {
      const result = safeEval(expr);
      if (!isFinite(result)) return { ok: false, error: "Result is not finite" };
      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ── 3. Metadata filter tool ────────────────────────────────────────────────

const metadataFilterTool: Tool = {
  name: "metadata_filter",
  description:
    "Filter previously retrieved passages by a metadata field. " +
    "Useful for narrowing results to a specific page, section, or source file.",
  inputSchema: {
    passages:
      "array — the passages array returned by a previous retriever call",
    field: 'string — one of "page", "section", "source"',
    value: "string | number — the value to match",
  },
  async run(input) {
    const passages = input.passages;
    const field = String(input.field ?? "");
    const value = input.value;

    if (!Array.isArray(passages))
      return { ok: false, error: "passages must be an array" };
    if (!["page", "section", "source"].includes(field))
      return {
        ok: false,
        error: 'field must be "page", "section", or "source"',
      };

    const filtered = (
      passages as Array<Record<string, unknown>>
    ).filter((p) => String(p[field]) === String(value));

    return { ok: true, data: filtered };
  },
};

// ── Registry ─────────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [retrieverTool, calculatorTool, metadataFilterTool];

export function getTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** Format tools for the agent system prompt. */
export function formatToolsForPrompt(): string {
  return TOOLS.map(
    (t) =>
      `Tool: ${t.name}\nDescription: ${t.description}\nInput: ${JSON.stringify(t.inputSchema)}`
  ).join("\n\n");
}

export type { ScoredDocument };
