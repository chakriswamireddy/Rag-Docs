"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  tenants: number;
  users: number;
  documents: number;
  queries: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [t, u, d, q] = await Promise.all([
        fetch("/api/admin/tenants?limit=1").then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch("/api/admin/users?limit=1").then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch("/api/admin/documents?limit=1").then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch("/api/admin/queries?limit=1").then((r) => r.json()).catch(() => ({ total: 0 })),
      ]) as [{ total?: number }, { total?: number }, { total?: number }, { total?: number }];
      setStats({
        tenants: t.total ?? 0,
        users: u.total ?? 0,
        documents: d.total ?? 0,
        queries: q.total ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: "Tenants", value: stats?.tenants, href: "/admin/tenants", color: "amber" },
    { label: "Users", value: stats?.users, href: "/admin/users", color: "cyan" },
    { label: "Documents", value: stats?.documents, href: "/admin/documents", color: "violet" },
    { label: "Queries", value: stats?.queries, href: "/admin/queries", color: "emerald" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-white/50">System overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20 hover:bg-white/8"
          >
            <span className="text-xs uppercase tracking-widest text-white/40">
              {card.label}
            </span>
            <span className="text-3xl font-semibold text-white">
              {loading ? (
                <span className="inline-block h-8 w-12 animate-pulse rounded bg-white/10" />
              ) : (
                card.value ?? 0
              )}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/metrics"
          className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-amber-300/20"
        >
          <p className="mb-1 text-xs uppercase tracking-widest text-white/40">Metrics</p>
          <p className="text-sm text-white/70">View latency, token usage, and performance trends.</p>
        </Link>
        <Link
          href="/admin/evaluations"
          className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300/20"
        >
          <p className="mb-1 text-xs uppercase tracking-widest text-white/40">Evaluations</p>
          <p className="text-sm text-white/70">Run and review RAG quality evaluations.</p>
        </Link>
      </div>
    </div>
  );
}
