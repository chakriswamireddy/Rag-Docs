"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";

const ALLOWED_ROLES = ["tenant_admin", "admin", "super_admin"];

export default function TenantAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = use(params);
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/${tenantSlug}/login`);
      return;
    }
    if (status === "authenticated" && !ALLOWED_ROLES.includes(session?.user?.role ?? "")) {
      router.replace(`/${tenantSlug}`);
    }
  }, [status, session, tenantSlug, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <span className="text-sm text-white/40">Loading...</span>
      </div>
    );
  }
  if (!session || !ALLOWED_ROLES.includes(session.user?.role ?? "")) return null;

  const tenantLabel = tenantSlug.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  const NAV = [
    { href: `/${tenantSlug}/admin`, label: "Dashboard", exact: true },
    { href: `/${tenantSlug}/admin/documents`, label: "Documents" },
    { href: `/${tenantSlug}/admin/users`, label: "Users" },
    { href: `/${tenantSlug}/admin/queries`, label: "Query Logs" },
    { href: `/${tenantSlug}/admin/metrics`, label: "Metrics" },
    { href: `/${tenantSlug}/admin/evaluations`, label: "Evaluations" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-8 sm:px-10">
      {/* Sidebar */}
      <aside className="hidden w-52 shrink-0 lg:block">
        <div className="sticky top-24 flex flex-col gap-1">
          <div className="mb-3 flex flex-col gap-1">
            <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">Tenant Admin</p>
            <Link
              href={`/${tenantSlug}`}
              className="text-[10px] text-amber-300/60 hover:text-amber-300 transition"
            >
              ← Back to {tenantLabel} app
            </Link>
          </div>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
      <div className="flex w-full flex-col gap-4 lg:hidden">
        <div className="flex flex-wrap gap-2">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
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
        <main>{children}</main>
      </div>

      {/* Desktop main */}
      <main className="hidden min-w-0 flex-1 lg:block">{children}</main>
    </div>
  );
}
