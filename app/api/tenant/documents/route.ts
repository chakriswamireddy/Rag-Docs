import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { listDocuments } from "@/lib/services/document.service";

export async function GET(req: NextRequest) {
  try {
    const { tenantId } = await requireTenant();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
    const docs = await listDocuments(tenantId, limit, offset);
    return NextResponse.json({ documents: docs, total: docs.length });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 });
  }
}
