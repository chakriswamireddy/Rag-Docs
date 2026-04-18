import { auth } from "@/lib/auth";

/**
 * Get the authenticated session. Returns null if unauthenticated.
 * For use in API routes and server components.
 */
export async function getSession() {
  return auth();
}

/**
 * Extract tenant_id from session. Throws 403 if user has no tenant.
 */
export async function requireTenant(): Promise<{
  userId: string;
  tenantId: string;
  role: string;
}> {
  const session = await auth();
  if (!session?.user) {
    throw new AuthError("Unauthorized", 401);
  }
  if (!session.user.tenantId) {
    throw new AuthError("User is not assigned to any tenant", 403);
  }
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    role: session.user.role,
  };
}

/**
 * Require that the user has a specific role.
 * Does NOT require tenantId — admins have no tenant.
 */
export async function requireRole(
  ...allowedRoles: string[]
): Promise<{ userId: string; tenantId: string | null; role: string }> {
  const session = await auth();
  if (!session?.user) {
    throw new AuthError("Unauthorized", 401);
  }
  const role = session.user.role ?? "";
  if (!allowedRoles.includes(role)) {
    throw new AuthError("Insufficient permissions", 403);
  }
  return {
    userId: session.user.id,
    tenantId: session.user.tenantId ?? null,
    role,
  };
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
