import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { getDocumentWithChunks } from "@/lib/services/document.service";
import { getJobsByDocument } from "@/lib/services/processing.service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requireTenant();
    const { id } = await params;

    const doc = await getDocumentWithChunks(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Verify tenant ownership
    if (doc.tenantId !== tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const jobs = await getJobsByDocument(id);

    return NextResponse.json({ document: doc, processingJobs: jobs });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get document" }, { status: 500 });
  }
}
