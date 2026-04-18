"use client";

import { useEffect, useState } from "react";

type Query = {
  id: string;
  question: string;
  answer: string | null;
  modelUsed: string | null;
  totalLatencyMs: number | null;
  retrievalLatencyMs: number | null;
  llmLatencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  rerankScore: number | null;
  createdAt: string;
};

export default function TenantQueriesPage() {
  const [queries, setQueries] = useState<Query[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Query | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/tenant/queries?limit=100")
      .then((r) => r.json())
      .then((d: { queries?: Query[] }) => { setQueries(d.queries ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Query Logs</h1>
        <p className="text-sm text-white/50">All questions asked by users in this tenant</p>
      </div>

      {selected && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-amber-300">{selected.question}</p>
            <button onClick={() => setSelected(null)}
              className="shrink-0 text-white/30 hover:text-white transition text-xs">✕ Close</button>
          </div>
          {selected.answer && (
            <p className="text-sm text-white/70 whitespace-pre-wrap">{selected.answer}</p>
          )}
          <div className="flex flex-wrap gap-3 text-[11px] text-white/40">
            {selected.modelUsed && <span>Model: <span className="text-white/60">{selected.modelUsed}</span></span>}
            {selected.totalLatencyMs !== null && <span>Total: <span className="text-white/60">{selected.totalLatencyMs} ms</span></span>}
            {selected.retrievalLatencyMs !== null && <span>Retrieval: <span className="text-white/60">{selected.retrievalLatencyMs} ms</span></span>}
            {selected.llmLatencyMs !== null && <span>LLM: <span className="text-white/60">{selected.llmLatencyMs} ms</span></span>}
            {selected.promptTokens !== null && <span>Prompt tokens: <span className="text-white/60">{selected.promptTokens}</span></span>}
            {selected.completionTokens !== null && <span>Completion tokens: <span className="text-white/60">{selected.completionTokens}</span></span>}
            {selected.rerankScore !== null && <span>Rerank: <span className="text-white/60">{selected.rerankScore.toFixed(3)}</span></span>}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : queries.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No queries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Question</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-left">Latency</th>
                <th className="px-4 py-3 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q) => (
                <tr key={q.id}
                  className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5 transition"
                  onClick={() => setSelected(q)}>
                  <td className="px-4 py-3 text-white max-w-64 truncate">{q.question}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{q.modelUsed ?? "—"}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{q.totalLatencyMs !== null ? `${q.totalLatencyMs} ms` : "—"}</td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(q.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
