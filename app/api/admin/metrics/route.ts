import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { getMetrics } from "@/lib/services/metrics.service";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const url = new URL(req.url);

    const data = await getMetrics(tenantId as string, {
      type: url.searchParams.get("type") ?? undefined,
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? "100"),
    });

    return NextResponse.json({ metrics: data });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get metrics" }, { status: 500 });
  }
}
