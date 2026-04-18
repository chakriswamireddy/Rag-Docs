"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("free");
  // Tenant admin fields
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function load() {
    const data = await fetch("/api/admin/tenants?limit=100")
      .then((r) => r.json())
      .catch(() => ({ tenants: [] })) as { tenants?: Tenant[] };
    setTenants(data.tenants ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/admin/tenants?limit=100")
      .then((r) => r.json())
      .then((data: { tenants?: Tenant[] }) => { setTenants(data.tenants ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setSaving(true);
    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, plan, adminName, adminEmail, adminPassword }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null) as { error?: string } | null;
      setError(d?.error ?? "Failed to create tenant");
      return;
    }
    const data = await res.json() as { tenant: { slug: string }; adminUser?: { email: string; created: boolean } | null };
    setName(""); setSlug(""); setPlan("free");
    setAdminName(""); setAdminEmail(""); setAdminPassword("");
    setShowForm(false);
    if (data.adminUser?.created) {
      setSuccessMsg(`Tenant created. Admin "${data.adminUser.email}" can sign in at /${data.tenant.slug}/login`);
    }
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tenant? This cannot be undone.")) return;
    await fetch(`/api/admin/tenants/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Tenants</h1>
          <p className="text-sm text-white/50">Manage organisations</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200"
        >
          {showForm ? "Cancel" : "New Tenant"}
        </button>
      </div>

      {successMsg && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-300">
          {successMsg}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-6"
        >
          {/* Tenant details */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-white/80">Tenant details</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Name *</label>
                <input
                  required value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="Acme Corp"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Slug *</label>
                <input
                  required value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="acme"
                />
                {slug && (
                  <p className="text-[10px] text-white/30">Login: /{slug}/login</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Plan</label>
                <select
                  value={plan} onChange={(e) => setPlan(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                >
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Tenant admin */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white/80">Tenant admin</h2>
              <span className="text-[10px] text-white/30">(optional — can be added later)</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Admin name</label>
                <input
                  value={adminName} onChange={(e) => setAdminName(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="Jane Doe"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Admin email</label>
                <input
                  type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="admin@acme.com"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">
                  Password {adminEmail ? "* (min 8)" : ""}
                </label>
                <input
                  type="password"
                  minLength={adminEmail ? 8 : undefined}
                  required={!!adminEmail}
                  value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="Set login password"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div>
            <button
              type="submit" disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Tenant"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No tenants yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Slug</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Users</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">{t.name}</td>
                  <td className="px-4 py-3 text-white/60 font-mono text-xs">{t.slug}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/60 capitalize">
                      {t.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      t.status === "active"
                        ? "bg-emerald-400/10 text-emerald-300"
                        : "bg-white/5 text-white/40"
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="text-xs text-amber-300/70 hover:text-amber-300 transition"
                    >
                      Manage users ↗
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-xs text-rose-400/60 hover:text-rose-300 transition"
                    >
                      Delete
                    </button>
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
