import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { listUsers, inviteUser } from "@/lib/services/user.service";

export async function GET(_req: NextRequest) {
  try {
    const { tenantId } = await requireTenant();
    const users = await listUsers(tenantId);
    return NextResponse.json({ users, total: users.length });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, role } = await requireTenant();
    // Only tenant_admin (or global admin) can add users
    if (!["tenant_admin", "admin", "super_admin"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const { email, name, password, userRole } = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
      userRole?: string;
    };
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!password || password.trim().length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const result = await inviteUser(tenantId, email, userRole ?? "user", name, password);
    return NextResponse.json(
      { user: result.user, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to add user" }, { status: 500 });
  }
}
