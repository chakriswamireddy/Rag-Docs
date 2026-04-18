"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
};

type TenantUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
};

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantId = (params as any).id as string;
  const router = useRouter();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Add user form state
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    const [tRes, uRes] = await Promise.all([
      fetch(`/api/admin/tenants/${tenantId}`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/admin/tenants/${tenantId}/users`).then((r) => r.json()).catch(() => ({ users: [] })),
    ]) as [{ tenant?: Tenant }, { users?: TenantUser[] }];
    setTenant(tRes.tenant ?? null);
    setUsers(uRes.users ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tenantId]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const res = await fetch(`/api/admin/tenants/${tenantId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    setSaving(false);

    if (!res.ok) {
      const d = await res.json().catch(() => null) as { error?: string } | null;
      setError(d?.error ?? "Failed to add user.");
      return;
    }

    const { created } = await res.json() as { created: boolean };
    setSuccess(created ? `User created. They can sign in at /${tenant?.slug}/login` : "Existing user assigned to this tenant.");
    setName(""); setEmail(""); setPassword(""); setRole("user");
    setShowForm(false);
    load();
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this user from the tenant?")) return;
    await fetch(`/api/admin/tenants/${tenantId}/users/${userId}`, { method: "DELETE" });
    load();
  }

  async function handleDelete() {
    if (!confirm(`Delete tenant "${tenant?.name}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/tenants/${tenantId}`, { method: "DELETE" });
    router.push("/admin/tenants");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-sm text-white/40">Loading...</span>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-rose-300">Tenant not found.</p>
        <Link href="/admin/tenants" className="text-xs text-amber-300 hover:text-amber-200">← Back to tenants</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link href="/admin/tenants" className="text-xs text-white/40 hover:text-white/60 transition">
            ← Tenants
          </Link>
          <h1 className="text-3xl font-semibold text-white">{tenant.name}</h1>
          <div className="flex items-center gap-3">
            <code className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-amber-300">
              /{tenant.slug}
            </code>
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-white/50 capitalize">
              {tenant.plan}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
              tenant.status === "active" ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-white/40"
            }`}>
              {tenant.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/${tenant.slug}/login`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-amber-300/30 px-4 py-2 text-xs text-amber-300 transition hover:bg-amber-300/10"
          >
            Open Login ↗
          </a>
          <button
            onClick={handleDelete}
            className="rounded-full border border-rose-400/20 px-4 py-2 text-xs text-rose-400/70 transition hover:border-rose-400/50 hover:text-rose-300"
          >
            Delete Tenant
          </button>
        </div>
      </div>

      {/* Login URL info box */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="mb-1 text-[10px] uppercase tracking-widest text-white/30">Tenant Access URLs</p>
        <div className="flex flex-col gap-1.5 mt-2">
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-16">Login</span>
            <code className="text-xs text-amber-300">/{tenant.slug}/login</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 w-16">App</span>
            <code className="text-xs text-white/70">/{tenant.slug}</code>
          </div>
        </div>
      </div>

      {/* Users section */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Users</h2>
          <button
            onClick={() => { setShowForm((v) => !v); setError(""); setSuccess(""); }}
            className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200"
          >
            {showForm ? "Cancel" : "Add User"}
          </button>
        </div>

        {success && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-300">
            {success}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleAddUser}
            className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4"
          >
            <h3 className="text-sm font-semibold text-white/80">Create user for this tenant</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Name</label>
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="Jane Doe"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Email *</label>
                <input
                  required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="jane@example.com"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Password * (min 8)</label>
                <input
                  required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                  placeholder="Set a password for this user"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-white/40">Role</label>
                <select
                  value={role} onChange={(e) => setRole(e.target.value)}
                  className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                >
                  <option value="user">User</option>
                  <option value="tenant_admin">Tenant Admin</option>
                </select>
              </div>
            </div>
            {error && <p className="text-xs text-rose-300">{error}</p>}
            <div>
              <button
                type="submit" disabled={saving}
                className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
          {users.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-white/40">No users in this tenant yet.</p>
              <p className="mt-2 text-xs text-white/30">Use "Add User" to create one, then share the login URL above.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 text-white">{u.name ?? "—"}</td>
                    <td className="px-4 py-3 text-white/60 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${
                        u.role === "tenant_admin"
                          ? "bg-amber-300/10 text-amber-300"
                          : "border border-white/15 text-white/50"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(u.id)}
                        className="text-xs text-rose-400/60 hover:text-rose-300 transition"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
