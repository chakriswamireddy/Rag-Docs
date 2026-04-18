import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { listEvalCases, createEvalCase } from "@/lib/services/evaluation.service";

export async function GET() {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const cases = await listEvalCases(tenantId as string);
    return NextResponse.json({ evaluations: cases });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to list evaluations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await requireRole("admin", "super_admin");
    const { question, expectedAnswer } = (await req.json()) as {
      question?: string;
      expectedAnswer?: string;
    };

    if (!question || !expectedAnswer) {
      return NextResponse.json(
        { error: "question and expectedAnswer are required" },
        { status: 400 }
      );
    }

    const evalCase = await createEvalCase(tenantId as string, question, expectedAnswer);
    return NextResponse.json({ evaluation: evalCase }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to create evaluation" }, { status: 500 });
  }
}
