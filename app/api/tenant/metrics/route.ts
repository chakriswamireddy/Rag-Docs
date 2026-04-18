import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { getMetrics } from "@/lib/services/metrics.service";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenant();
    const url = new URL(req.url);
    const data = await getMetrics(tenantId, {
      type: url.searchParams.get("type") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? "200"),
    });
    return NextResponse.json({ metrics: data });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get metrics" }, { status: 500 });
  }
}
