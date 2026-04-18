import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { getEvalResults } from "@/lib/services/evaluation.service";

export async function GET() {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const results = await getEvalResults(tenantId);
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get results" }, { status: 500 });
  }
}
