import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { listUsers, inviteUser } from "@/lib/services/user.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireRole("admin", "super_admin");
    const { id } = await params;
    const data = await listUsers(id);
    return NextResponse.json({ users: data });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireRole("admin", "super_admin");
    const { id: tenantId } = await params;
    const { email, role, name, password } = (await req.json()) as {
      email?: string;
      role?: string;
      name?: string;
      password?: string;
    };

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (!password || password.trim().length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const result = await inviteUser(tenantId, email, role || "user", name, password);
    return NextResponse.json(
      { user: result.user, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to invite user" }, { status: 500 });
  }
}
