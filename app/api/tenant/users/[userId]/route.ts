import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { removeUser } from "@/lib/services/user.service";

type Params = { params: Promise<{ userId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { tenantId, role } = await requireTenant();
    if (!["tenant_admin", "admin", "super_admin"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const { userId } = await params;
    const deleted = await removeUser(userId, tenantId);
    if (!deleted) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to remove user" }, { status: 500 });
  }
}
