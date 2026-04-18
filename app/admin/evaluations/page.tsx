"use client";

import { useEffect, useState } from "react";

type Evaluation = {
  id: string;
  name: string;
  status: string;
  score: number | null;
  totalQuestions: number | null;
  tenantId: string | null;
  createdAt: string;
};

export default function EvaluationsPage() {
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState('[{"question":"What is the main topic?","expectedAnswer":""}]');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const data = await fetch("/api/admin/evaluations?limit=50")
      .then((r) => r.json())
      .catch(() => ({ evaluations: [] })) as { evaluations?: Evaluation[] };
    setEvals(data.evaluations ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/admin/evaluations?limit=50")
      .then((r) => r.json())
      .then((data: { evaluations?: Evaluation[] }) => { setEvals(data.evaluations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    let parsed;
    try { parsed = JSON.parse(questions); } catch {
      setError("Questions must be valid JSON array.");
      setSaving(false);
      return;
    }
    const res = await fetch("/api/admin/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, questions: parsed }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null) as { error?: string } | null;
      setError(d?.error ?? "Failed to create evaluation.");
      return;
    }
    setName(""); setShowForm(false);
    load();
  }

  async function handleRun(id: string) {
    await fetch(`/api/admin/evaluations/${id}/run`, { method: "POST" });
    load();
  }

  const statusColor: Record<string, string> = {
    pending: "text-white/40 bg-white/5",
    running: "text-amber-300 bg-amber-300/10",
    completed: "text-emerald-300 bg-emerald-300/10",
    failed: "text-rose-300 bg-rose-300/10",
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Evaluations</h1>
          <p className="text-sm text-white/50">RAG quality benchmarks</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200"
        >
          {showForm ? "Cancel" : "New Evaluation"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4"
        >
          <h2 className="text-sm font-semibold text-white/80">Create evaluation</h2>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-white/40">Name</label>
            <input
              required value={name} onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
              placeholder="Q2 benchmark"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-widest text-white/40">
              Questions (JSON array of <code className="text-white/60">{"{ question, expectedAnswer }"}</code>)
            </label>
            <textarea
              required value={questions} onChange={(e) => setQuestions(e.target.value)}
              rows={5}
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-white focus:border-amber-300/50 focus:outline-none"
            />
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div>
            <button
              type="submit" disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : evals.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No evaluations yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left">Questions</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {evals.map((ev) => (
                <tr key={ev.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">{ev.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColor[ev.status] ?? "text-white/40"}`}>
                      {ev.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70 text-xs">
                    {ev.score != null ? (
                      <span className={ev.score >= 0.7 ? "text-emerald-300" : ev.score >= 0.4 ? "text-amber-300" : "text-rose-300"}>
                        {(ev.score * 100).toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/50 text-xs">{ev.totalQuestions ?? "—"}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(ev.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {ev.status === "pending" && (
                      <button
                        onClick={() => handleRun(ev.id)}
                        className="text-xs text-amber-300/70 hover:text-amber-300 transition"
                      >
                        Run
                      </button>
                    )}
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
