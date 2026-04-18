import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/services/tenant.service";

/**
 * Shared layout for all /{tenantSlug}/* routes.
 * Validates the slug exists. Renders nothing extra — pages handle their own auth.
 */
export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;

  // Reserved slugs that belong to top-level Next.js routes
  const reserved = ["admin", "auth", "api", "_next", "favicon.ico"];
  if (reserved.includes(tenantSlug)) return <>{children}</>;

  const tenant = await getTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  return <>{children}</>;
}
