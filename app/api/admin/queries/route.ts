import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { getQueryHistory } from "@/lib/services/query.service";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

    const data = await getQueryHistory(tenantId, limit, offset);
    return NextResponse.json({ queries: data, limit, offset });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get queries" }, { status: 500 });
  }
}
