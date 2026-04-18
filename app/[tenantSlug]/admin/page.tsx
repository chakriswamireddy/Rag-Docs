"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Stats = { documents: number; users: number; queries: number };

export default function TenantDashboard({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function load() {
      const [d, u, q] = await Promise.all([
        fetch("/api/tenant/documents?limit=1").then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch("/api/tenant/users").then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch("/api/tenant/queries?limit=1").then((r) => r.json()).catch(() => ({ total: 0 })),
      ]) as [{ total?: number }, { total?: number }, { total?: number }];
      setStats({ documents: d.total ?? 0, users: u.total ?? 0, queries: q.total ?? 0 });
    }
    load();
  }, []);

  const cards = [
    { label: "Documents", value: stats?.documents, href: `/${tenantSlug}/admin/documents` },
    { label: "Users", value: stats?.users, href: `/${tenantSlug}/admin/users` },
    { label: "Queries", value: stats?.queries, href: `/${tenantSlug}/admin/queries` },
  ];

  const tenantLabel = tenantSlug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold text-white">{tenantLabel}</h1>
          <p className="text-sm text-white/50">Tenant overview</p>
        </div>
        <Link
          href={`/${tenantSlug}`}
          className="rounded-full border border-amber-300/30 px-4 py-2 text-xs text-amber-300 transition hover:bg-amber-300/10"
        >
          Open App ↗
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/20"
          >
            <span className="text-xs uppercase tracking-widest text-white/40">{card.label}</span>
            <span className="text-3xl font-semibold text-white">
              {stats === null ? (
                <span className="inline-block h-8 w-10 animate-pulse rounded bg-white/10" />
              ) : (
                card.value ?? 0
              )}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`/${tenantSlug}/admin/metrics`}
          className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-amber-300/20"
        >
          <p className="mb-1 text-xs uppercase tracking-widest text-white/40">Metrics</p>
          <p className="text-sm text-white/70">Latency, token usage, pipeline performance.</p>
        </Link>
        <Link
          href={`/${tenantSlug}/admin/evaluations`}
          className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-cyan-300/20"
        >
          <p className="mb-1 text-xs uppercase tracking-widest text-white/40">Evaluations</p>
          <p className="text-sm text-white/70">Run quality benchmarks against your data.</p>
        </Link>
      </div>
    </div>
  );
}
