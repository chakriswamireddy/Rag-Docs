"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type User = { id: string; email: string; name: string | null; role: string; createdAt: string };

export default function TenantUsersPage() {
  const { data: session } = useSession();
  const isAdmin = ["tenant_admin", "admin", "super_admin"].includes(session?.user?.role ?? "");

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    const data = await fetch("/api/tenant/users").then((r) => r.json()).catch(() => ({ users: [] })) as { users?: User[] };
    setUsers(data.users ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    setSaving(true);
    const res = await fetch("/api/tenant/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, userRole: role }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null) as { error?: string } | null;
      setError(d?.error ?? "Failed to add user.");
      return;
    }
    const { created } = await res.json() as { created: boolean };
    setSuccess(created ? `User created. They can sign in at the tenant login page.` : "User already existed and has been assigned to this tenant.");
    setName(""); setEmail(""); setPassword(""); setRole("user"); setShowForm(false);
    load();
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this user from the tenant?")) return;
    await fetch(`/api/tenant/users/${userId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Users</h1>
          <p className="text-sm text-white/50">Members of this tenant</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setShowForm((v) => !v); setError(""); setSuccess(""); }}
            className="rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200">
            {showForm ? "Cancel" : "Add User"}
          </button>
        )}
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-xs text-emerald-300">{success}</div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-white/80">Add user</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                placeholder="Jane Doe" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Email *</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                placeholder="jane@example.com" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Password * (min 8)</label>
              <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none"
                placeholder="••••••••" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-widest text-white/40">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)}
                className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-amber-300/50 focus:outline-none">
                <option value="user">User</option>
                <option value="tenant_admin">Tenant Admin</option>
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div>
            <button type="submit" disabled={saving}
              className="rounded-full bg-amber-300 px-5 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:opacity-60">
              {saving ? "Adding..." : "Add User"}
            </button>
          </div>
        </form>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No users yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Joined</th>
                {isAdmin && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white">{u.name ?? "—"}</td>
                  <td className="px-4 py-3 text-white/60 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${u.role === "tenant_admin" ? "bg-amber-300/10 text-amber-300" : "border border-white/15 text-white/50"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      {u.id !== session?.user?.id && (
                        <button onClick={() => handleRemove(u.id)}
                          className="text-xs text-rose-400/60 hover:text-rose-300 transition">
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
