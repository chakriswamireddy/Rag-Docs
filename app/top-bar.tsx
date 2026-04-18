"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

export function TopBar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  const role = session?.user?.role ?? "";
  const isGlobalAdmin = role === "admin" || role === "super_admin";
  const isTenantAdmin = role === "tenant_admin";
  const tenantSlug = session?.user?.tenantSlug;
  const isAuthPage = pathname.startsWith("/auth");

  if (isAuthPage) return null;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-10">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-semibold tracking-widest text-white/80 uppercase hover:text-white transition"
          >
            Rag Studio
          </Link>
          {isGlobalAdmin && (
            <Link
              href="/admin"
              className="text-xs text-white/50 hover:text-amber-300 transition uppercase tracking-widest"
            >
              Admin
            </Link>
          )}
          {(isTenantAdmin || isGlobalAdmin) && tenantSlug && (
            <Link
              href={`/${tenantSlug}/admin`}
              className="text-xs text-white/50 hover:text-amber-300 transition uppercase tracking-widest"
            >
              Tenant Admin
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {status === "loading" ? (
            <span className="text-xs text-white/40">Loading...</span>
          ) : session ? (
            <>
              <span className="hidden text-xs text-white/50 sm:block">
                {session.user?.email}
                {session.user?.role && (
                  <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/40">
                    {session.user.role}
                  </span>
                )}
              </span>
              <button
                onClick={() => {
                  if (window.confirm("Are you sure you want to sign out?")) {
                    signOut({ callbackUrl: "/auth/signin" });
                  }
                }}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-rose-400/40 hover:text-rose-300"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/auth/signin"
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-white/40 hover:text-white"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
