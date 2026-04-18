"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  tenantId: string | null;
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await fetch("/api/admin/users?limit=100")
      .then((r) => r.json())
      .catch(() => ({ users: [] })) as { users?: User[] };
    setUsers(data.users ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/admin/users?limit=100")
      .then((r) => r.json())
      .then((data: { users?: User[] }) => { setUsers(data.users ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleRoleToggle(user: User) {
    const newRole = user.role === "admin" ? "member" : "admin";
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this user?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold text-white">Users</h1>
        <p className="text-sm text-white/50">All registered users</p>
      </div>

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
                <th className="px-4 py-3 text-left">Tenant</th>
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
                    <button
                      onClick={() => handleRoleToggle(u)}
                      className={`rounded-full px-2 py-0.5 text-xs transition ${
                        u.role === "admin"
                          ? "bg-amber-300/10 text-amber-300 hover:bg-amber-300/20"
                          : "border border-white/15 text-white/50 hover:text-white"
                      }`}
                    >
                      {u.role}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-white/40 font-mono text-xs">
                    {u.tenantId ? u.tenantId.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(u.id)}
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
