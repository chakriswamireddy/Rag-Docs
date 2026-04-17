/**
 * Evaluation pipeline runner.
 *
 * Usage:
 *   node scripts/eval/run-eval.mjs [--base-url http://localhost:3000]
 *
 * For each test case in dataset.json it:
 *   1. Posts to /api/ask (JSON mode — no streaming so we get latency numbers)
 *   2. Scores the answer:
 *      - exact:    1 if the expected answer appears verbatim in the response
 *      - f1:       token overlap F1 between expected and actual answer
 *      - grounded: reports the API's own isGrounded flag
 *   3. Writes results to scripts/eval/eval-results.json and prints a summary
 *
 * If expectedAnswer is empty the row is recorded but scoring is skipped.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = (() => {
  const idx = process.argv.indexOf("--base-url");
  return idx !== -1 ? process.argv[idx + 1] : "http://localhost:3000";
})();

const DATASET_PATH = path.join(__dirname, "dataset.json");
const RESULTS_PATH = path.join(__dirname, "eval-results.json");

// ── Scoring helpers ──────────────────────────────────────────────────────────

function tokenize(text) {
  return text
    .toLowerCase()
    .match(/\b[a-z0-9]+\b/g) ?? [];
}

function f1Score(expected, actual) {
  if (!expected || !actual) return 0;
  const expTokens = new Set(tokenize(expected));
  const actTokens = tokenize(actual);
  if (expTokens.size === 0 || actTokens.length === 0) return 0;

  const tp = actTokens.filter((t) => expTokens.has(t)).length;
  const precision = tp / actTokens.length;
  const recall = tp / expTokens.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function exactMatch(expected, actual) {
  if (!expected) return null; // no expected answer — skip
  return actual.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, "utf-8"));
  console.log(`\nRunning ${dataset.length} eval cases against ${BASE_URL}\n${"─".repeat(60)}`);

  const results = [];
  let totalF1 = 0;
  let totalExact = 0;
  let scoredCount = 0;
  let totalMs = 0;

  for (const testCase of dataset) {
    const start = Date.now();

    let data;
    try {
      const res = await fetch(`${BASE_URL}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: testCase.question, mode: "json" }),
      });
      data = await res.json();
    } catch (err) {
      console.error(`  [${testCase.id}] FETCH ERROR: ${err.message}`);
      results.push({ ...testCase, error: err.message });
      continue;
    }

    const latencyMs = Date.now() - start;
    totalMs += latencyMs;

    const actual = data.answer ?? "";
    const expected = testCase.expectedAnswer ?? "";
    const hasExpected = expected.trim().length > 0;

    const f1 = hasExpected ? f1Score(expected, actual) : null;
    const exact = hasExpected ? exactMatch(expected, actual) : null;

    if (hasExpected) {
      totalF1 += f1;
      totalExact += exact;
      scoredCount++;
    }

    const row = {
      id: testCase.id,
      question: testCase.question,
      expected,
      actual,
      queryType: data.queryType ?? "?",
      isGrounded: data.verification?.isGrounded ?? null,
      groundingConfidence: data.verification?.confidence ?? null,
      f1: f1 !== null ? +f1.toFixed(3) : null,
      exact,
      latencyMs,
    };

    results.push(row);

    const scoreStr = hasExpected
      ? `F1=${row.f1} exact=${row.exact}`
      : "no expected answer (skipped scoring)";
    const groundStr =
      row.isGrounded !== null
        ? `grounded=${row.isGrounded} (${(row.groundingConfidence * 100).toFixed(0)}%)`
        : "";

    console.log(`  [${testCase.id}] ${scoreStr}  ${groundStr}  ${latencyMs}ms`);
  }

  const summary = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalCases: dataset.length,
    scoredCases: scoredCount,
    avgF1: scoredCount > 0 ? +(totalF1 / scoredCount).toFixed(3) : null,
    exactMatchRate: scoredCount > 0 ? +(totalExact / scoredCount).toFixed(3) : null,
    avgLatencyMs: Math.round(totalMs / dataset.length),
    results,
  };

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  Cases scored : ${scoredCount}/${dataset.length}`);
  if (scoredCount > 0) {
    console.log(`  Avg F1       : ${summary.avgF1}`);
    console.log(`  Exact match  : ${(summary.exactMatchRate * 100).toFixed(1)}%`);
  }
  console.log(`  Avg latency  : ${summary.avgLatencyMs}ms`);
  console.log(`\nResults written to ${RESULTS_PATH}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
