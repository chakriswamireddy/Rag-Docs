import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { listEvalCases, createEvalCase, runEvaluation } from "@/lib/services/evaluation.service";

export async function GET() {
  try {
    const { tenantId } = await requireTenant();
    const cases = await listEvalCases(tenantId);
    return NextResponse.json({ evaluations: cases });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to list evaluations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireTenant();
    const body = (await req.json()) as { action?: string; question?: string; expectedAnswer?: string };

    if (body.action === "run") {
      const results = await runEvaluation(tenantId);
      return NextResponse.json({ results });
    }

    if (!body.question || !body.expectedAnswer) {
      return NextResponse.json(
        { error: "question and expectedAnswer are required" },
        { status: 400 }
      );
    }
    const evalCase = await createEvalCase(tenantId, body.question, body.expectedAnswer);
    return NextResponse.json({ evaluation: evalCase }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
