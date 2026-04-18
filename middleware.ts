import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Slugs that are real Next.js routes, not tenant slugs
const RESERVED_SLUGS = new Set(["admin", "auth", "api", "_next"]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow public auth + webhook routes
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname === "/auth/signin" ||
    pathname === "/auth/error" ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  // Allow /{tenantSlug}/login publicly
  const tenantLoginMatch = pathname.match(/^\/([^/]+)\/login$/);
  if (tenantLoginMatch && !RESERVED_SLUGS.has(tenantLoginMatch[1])) {
    return NextResponse.next();
  }

  // API routes require authentication
  if (pathname.startsWith("/api/")) {
    if (!req.auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // /{tenantSlug} (non-reserved) — redirect to tenant login if not authed
  const tenantAppMatch = pathname.match(/^\/([^/]+)(\/.*)?$/);
  if (
    tenantAppMatch &&
    !RESERVED_SLUGS.has(tenantAppMatch[1]) &&
    !req.auth?.user
  ) {
    const slug = tenantAppMatch[1];
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = `/${slug}/login`;
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

