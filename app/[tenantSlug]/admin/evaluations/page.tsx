"use client";

import { useEffect, useState } from "react";

type EvalCase = {
  id: string;
  question: string;
  expectedAnswer: string;
  lastScore: number | null;
  lastRunAt: string | null;
  createdAt: string;
};

type RunResult = { question: string; score: number; answer: string };

export default function TenantEvaluationsPage() {
  const [cases, setCases] = useState<EvalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<RunResult[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [question, setQuestion] = useState("");
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const d = await fetch("/api/tenant/evaluations")
      .then((r) => r.json())
      .catch(() => ({ evaluations: [] })) as { evaluations?: EvalCase[] };
    setCases(d.evaluations ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/tenant/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, expectedAnswer: expected }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null) as { error?: string } | null;
      setError(d?.error ?? "Failed");
      return;
    }
    setQuestion(""); setExpected(""); setShowForm(false);
    load();
  }

  async function handleRun() {
    if (!confirm("Run all evaluation cases? This will query the RAG pipeline for each case.")) return;
    setRunning(true);
    setRunResults(null);
    const res = await fetch("/api/tenant/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "run" }),
    });
    setRunning(false);
    if (res.ok) {
      const d = await res.json() as { results?: RunResult[] };
      setRunResults(d.results ?? []);
      load();
    }
  }

  const avgScore =
    cases.length > 0
      ? cases.filter((c) => c.lastScore !== null).reduce((s, c) => s + (c.lastScore ?? 0), 0) /
        (cases.filter((c) => c.lastScore !== null).length || 1)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-white">Evaluations</h1>
          <p className="text-sm text-white/50">Quality benchmarks for your RAG pipeline</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => { setShowForm((v) => !v); setError(""); }}
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-white/40 hover:text-white">
            {showForm ? "Cancel" : "Add Case"}
          </button>
          {cases.length > 0 && (
            <button onClick={handleRun} disabled={running}
              className="rounded-full bg-amber-300 px-4 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:opacity-60">
              {running ? "Running..." : "Run All"}
            </button>
          )}
        </div>
      </div>

      {avgScore !== null && (
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 flex items-center gap-4">
          <span className="text-xs uppercase tracking-widest text-white/30">Avg Score</span>
          <span className={`text-2xl font-semibold ${avgScore >= 0.7 ? "text-emerald-300" : avgScore >= 0.4 ? "text-amber-300" : "text-rose-300"}`}>
            {(avgScore * 100).toFixed(0)}%
          </span>
          <span className="text-xs text-white/30">({cases.filter((c) => c.lastScore !== null).length} of {cases.length} evaluated)</span>
        </div>
      )}

      {runResults && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5 flex flex-col gap-3">
          <p className="text-xs font-semibold text-emerald-300">Run complete — {runResults.length} cases</p>
          {runResults.map((r, i) => (
            <div key={i} className="border-t border-white/5 pt-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-white/70 flex-1 min-w-0 truncate">{r.question}</span>
                <span className={`text-xs font-semibold shrink-0 ${r.score >= 0.7 ? "text-emerald-300" : r.score >= 0.4 ? "text-amber-300" : "text-rose-300"}`}>
                  {(r.score * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-white/40 line-clamp-2">{r.answer}</p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white/80">New eval case</h2>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-white/40">Question *</label>
            <input required value={question} onChange={(e) => setQuestion(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
              placeholder="What is the refund policy?" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-white/40">Expected Answer *</label>
            <textarea required rows={3} value={expected} onChange={(e) => setExpected(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none resize-none"
              placeholder="Refunds are accepted within 30 days..." />
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div>
            <button type="submit" disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:opacity-60">
              {saving ? "Saving..." : "Add Case"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No eval cases yet. Add one to benchmark your pipeline.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Question</th>
                <th className="px-4 py-3 text-left">Expected Answer</th>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left">Last Run</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white max-w-48 truncate">{c.question}</td>
                  <td className="px-4 py-3 text-white/50 text-xs max-w-48 truncate">{c.expectedAnswer}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.lastScore !== null ? (
                      <span className={`font-semibold ${c.lastScore >= 0.7 ? "text-emerald-300" : c.lastScore >= 0.4 ? "text-amber-300" : "text-rose-300"}`}>
                        {(c.lastScore * 100).toFixed(0)}%
                      </span>
                    ) : <span className="text-white/30">Not run</span>}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {c.lastRunAt ? new Date(c.lastRunAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
