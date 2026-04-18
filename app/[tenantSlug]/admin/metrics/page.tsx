"use client";

import { useEffect, useState } from "react";

type Metrics = {
  totalQueries: number;
  avgLatencyMs: number | null;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
  avgRerankScore: number | null;
  rows: {
    id: string;
    question: string;
    totalLatencyMs: number | null;
    promptTokens: number | null;
    completionTokens: number | null;
    rerankScore: number | null;
    createdAt: string;
  }[];
};

function StatCard({ label, value, unit }: { label: string; value: number | null; unit?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-widest text-white/30">{label}</span>
      <span className="text-3xl font-semibold text-white">
        {value === null ? "—" : unit ? `${value}${unit}` : value}
      </span>
    </div>
  );
}

export default function TenantMetricsPage() {
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tenant/metrics")
      .then((r) => r.json())
      .then((d: Metrics) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Metrics</h1>
        <p className="text-sm text-white/50">Query performance and usage stats</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-white/40">Loading...</div>
      ) : !data ? (
        <div className="p-8 text-center text-sm text-white/40">No data available.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Queries" value={data.totalQueries} />
            <StatCard label="Avg Latency" value={data.avgLatencyMs !== null ? Math.round(data.avgLatencyMs) : null} unit=" ms" />
            <StatCard label="Avg Prompt Tokens" value={data.avgPromptTokens !== null ? Math.round(data.avgPromptTokens) : null} />
            <StatCard label="Avg Rerank Score" value={data.avgRerankScore !== null ? parseFloat(data.avgRerankScore.toFixed(3)) : null} />
          </div>

          {data.rows.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                    <th className="px-4 py-3 text-left">Question</th>
                    <th className="px-4 py-3 text-left">Latency</th>
                    <th className="px-4 py-3 text-left">Tokens (P/C)</th>
                    <th className="px-4 py-3 text-left">Rerank</th>
                    <th className="px-4 py-3 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-3 text-white max-w-56 truncate">{r.question}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{r.totalLatencyMs !== null ? `${r.totalLatencyMs} ms` : "—"}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">
                        {r.promptTokens ?? "—"} / {r.completionTokens ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-white/50 text-xs">{r.rerankScore !== null ? r.rerankScore.toFixed(3) : "—"}</td>
                      <td className="px-4 py-3 text-white/40 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
