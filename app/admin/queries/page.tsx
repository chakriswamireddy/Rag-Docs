"use client";

import { useEffect, useState } from "react";

type Query = {
  id: string;
  question: string;
  queryType: string;
  totalLatencyMs: number | null;
  tokenUsage: number | null;
  tenantId: string | null;
  createdAt: string;
};

export default function QueriesPage() {
  const [queries, setQueries] = useState<Query[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Query | null>(null);

  async function load() {
    const data = await fetch("/api/admin/queries?limit=50")
      .then((r) => r.json())
      .catch(() => ({ queries: [] })) as { queries?: Query[] };
    setQueries(data.queries ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Query Logs</h1>
          <p className="text-sm text-white/50">Recent RAG pipeline executions</p>
        </div>
        <button
          onClick={load}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-white/40 hover:text-white"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : queries.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No queries logged yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Question</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Latency</th>
                <th className="px-4 py-3 text-left">Tokens</th>
                <th className="px-4 py-3 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q) => (
                <tr
                  key={q.id}
                  className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/5 transition"
                  onClick={() => setSelected(q)}
                >
                  <td className="px-4 py-3 text-white max-w-70 truncate" title={q.question}>
                    {q.question}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/50 capitalize">
                      {q.queryType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">
                    {q.totalLatencyMs != null ? `${q.totalLatencyMs} ms` : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/60 text-xs">
                    {q.tokenUsage ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {new Date(q.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setSelected(null)}>
          <div
            className="w-full max-w-lg rounded-3xl border border-white/10 bg-zinc-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Query detail</h2>
              <button onClick={() => setSelected(null)} className="text-xs text-white/40 hover:text-white transition">Close</button>
            </div>
            <p className="mb-4 text-sm text-white/80">{selected.question}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-white/40">Type</dt>
                <dd className="text-white capitalize">{selected.queryType}</dd>
              </div>
              <div>
                <dt className="text-white/40">Latency</dt>
                <dd className="text-white">{selected.totalLatencyMs != null ? `${selected.totalLatencyMs} ms` : "—"}</dd>
              </div>
              <div>
                <dt className="text-white/40">Tokens</dt>
                <dd className="text-white">{selected.tokenUsage ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-white/40">Tenant</dt>
                <dd className="text-white font-mono">{selected.tenantId ?? "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-white/40">Time</dt>
                <dd className="text-white">{new Date(selected.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
