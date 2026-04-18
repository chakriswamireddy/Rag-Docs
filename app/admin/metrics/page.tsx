"use client";

import { useEffect, useState } from "react";

type Metric = {
  id: string;
  name: string;
  value: number;
  unit: string;
  tenantId: string | null;
  createdAt: string;
};

type Aggregated = {
  name: string;
  avg: number;
  min: number;
  max: number;
  count: number;
  unit: string;
};

function aggregate(metrics: Metric[]): Aggregated[] {
  const grouped: Record<string, Metric[]> = {};
  for (const m of metrics) {
    if (!grouped[m.name]) grouped[m.name] = [];
    grouped[m.name].push(m);
  }
  return Object.entries(grouped).map(([name, items]) => {
    const values = items.map((i) => i.value);
    return {
      name,
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
      unit: items[0].unit,
    };
  });
}

const METRIC_LABELS: Record<string, string> = {
  retrieval_latency: "Retrieval latency",
  rerank_latency: "Rerank latency",
  llm_latency: "LLM latency",
  total_latency: "Total latency",
  token_usage: "Token usage",
};

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await fetch("/api/admin/metrics?limit=500")
      .then((r) => r.json())
      .catch(() => ({ metrics: [] })) as { metrics?: Metric[] };
    setMetrics(data.metrics ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/admin/metrics?limit=500")
      .then((r) => r.json())
      .then((data: { metrics?: Metric[] }) => { setMetrics(data.metrics ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const agg = aggregate(metrics);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Metrics</h1>
          <p className="text-sm text-white/50">Pipeline performance aggregates</p>
        </div>
        <button
          onClick={load}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-white/40 hover:text-white"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/40">Loading...</div>
      ) : agg.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/40">
          No metrics yet. Run some queries to generate data.
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agg.map((m) => (
              <div key={m.name} className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-widest text-white/40">
                  {METRIC_LABELS[m.name] ?? m.name}
                </p>
                <p className="text-3xl font-semibold text-white">
                  {m.avg}
                  <span className="ml-1 text-base font-normal text-white/40">{m.unit}</span>
                </p>
                <div className="flex gap-4 text-xs text-white/50">
                  <span>Min: {m.min}{m.unit}</span>
                  <span>Max: {m.max}{m.unit}</span>
                  <span>{m.count} samples</span>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-white/30">Recent raw metrics</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                  <th className="px-4 py-2 text-left">Metric</th>
                  <th className="px-4 py-2 text-left">Value</th>
                  <th className="px-4 py-2 text-left">Tenant</th>
                  <th className="px-4 py-2 text-left">Time</th>
                </tr>
              </thead>
              <tbody>
                {metrics.slice(0, 50).map((m) => (
                  <tr key={m.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2 text-white/70 text-xs">{METRIC_LABELS[m.name] ?? m.name}</td>
                    <td className="px-4 py-2 text-white text-xs font-mono">{m.value}{m.unit}</td>
                    <td className="px-4 py-2 text-white/40 font-mono text-xs">{m.tenantId ? m.tenantId.slice(0, 8) + "…" : "—"}</td>
                    <td className="px-4 py-2 text-white/40 text-xs">{new Date(m.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
