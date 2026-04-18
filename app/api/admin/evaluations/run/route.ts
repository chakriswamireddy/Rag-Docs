import { NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { runEvaluation } from "@/lib/services/evaluation.service";

export async function POST() {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const results = await runEvaluation(tenantId as string);
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Evaluation run failed" }, { status: 500 });
  }
}
