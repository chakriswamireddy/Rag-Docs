"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useEffect } from "react";

const NAV = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/tenants", label: "Tenants" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/queries", label: "Query Logs" },
  { href: "/admin/metrics", label: "Metrics" },
  { href: "/admin/evaluations", label: "Evaluations" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      redirect("/auth/signin");
    }
    if (status === "authenticated" && session?.user?.role !== "admin") {
      redirect("/");
    }
  }, [status, session]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <span className="text-sm text-white/40">Loading...</span>
      </div>
    );
  }

  if (!session || session.user?.role !== "admin") return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-8 sm:px-10">
      {/* Sidebar */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <div className="sticky top-24 flex flex-col gap-1">
          <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-white/30">
            Admin
          </p>
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2 text-sm transition ${
                  active
                    ? "bg-amber-300/10 text-amber-300"
                    : "text-white/50 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="mb-4 flex flex-wrap gap-2 lg:hidden">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-xs transition ${
                active
                  ? "bg-amber-300/10 text-amber-300 border border-amber-300/20"
                  : "border border-white/10 text-white/50 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
