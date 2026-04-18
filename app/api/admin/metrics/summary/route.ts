import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { getMetricsSummary } from "@/lib/services/metrics.service";

export async function GET() {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const summary = await getMetricsSummary(tenantId);
    return NextResponse.json({ summary });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get summary" }, { status: 500 });
  }
}
