import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { listTenants, createTenant } from "@/lib/services/tenant.service";
import { inviteUser } from "@/lib/services/user.service";

export async function GET() {
  try {
    await requireRole("admin", "super_admin");
    const data = await listTenants();
    return NextResponse.json({ tenants: data });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to list tenants" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("admin", "super_admin");
    const body = (await req.json()) as {
      name?: string;
      slug?: string;
      plan?: string;
      adminName?: string;
      adminEmail?: string;
      adminPassword?: string;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Tenant name is required" }, { status: 400 });
    }
    if (!body.slug?.trim()) {
      return NextResponse.json({ error: "Tenant slug is required" }, { status: 400 });
    }
    if (!/^[a-z0-9-]+$/.test(body.slug.trim())) {
      return NextResponse.json(
        { error: "Slug may only contain lowercase letters, numbers, and hyphens" },
        { status: 400 }
      );
    }

    // Validate admin fields if provided
    const hasAdmin = !!(body.adminEmail?.trim());
    if (hasAdmin) {
      if (!body.adminPassword || body.adminPassword.trim().length < 8) {
        return NextResponse.json(
          { error: "Tenant admin password must be at least 8 characters" },
          { status: 400 }
        );
      }
    }

    const tenant = await createTenant({
      name: body.name.trim(),
      slug: body.slug.trim(),
      plan: body.plan ?? "free",
    });

    let adminUser = null;
    if (hasAdmin) {
      const result = await inviteUser(
        tenant.id,
        body.adminEmail!.trim(),
        "tenant_admin",
        body.adminName?.trim() || undefined,
        body.adminPassword!.trim(),
      );
      adminUser = { email: result.user.email, created: result.created };
    }

    return NextResponse.json({ tenant, adminUser }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to create tenant" }, { status: 500 });
  }
}
