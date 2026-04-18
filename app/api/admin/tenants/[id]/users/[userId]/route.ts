import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { updateUserRole, removeUser } from "@/lib/services/user.service";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    await requireRole("admin", "super_admin");
    const { userId } = await params;
    const { role } = (await req.json()) as { role?: string };

    if (!role) {
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    const updated = await updateUserRole(userId, role);
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ user: updated });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole("admin", "super_admin");
    const { id: tenantId, userId } = await params;
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
