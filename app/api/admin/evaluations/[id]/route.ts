import { NextRequest, NextResponse } from "next/server";
import { requireRole, AuthError } from "@/lib/tenant-context";
import { deleteEvalCase } from "@/lib/services/evaluation.service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireRole("admin", "super_admin");
    const { id } = await params;
    const deleted = await deleteEvalCase(id);
    if (!deleted) {
      return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to delete evaluation" }, { status: 500 });
  }
}
