import { NextRequest, NextResponse } from "next/server";
import { requireTenant, AuthError } from "@/lib/tenant-context";
import { getDocumentWithChunks } from "@/lib/services/document.service";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/documents/[id]/download
 *
 * Returns the file URL for a document. In production this would be a signed URL
 * with a short expiry. For now it returns the stored R2/S3 URL with tenant check.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { tenantId } = await requireTenant();
    const { id } = await params;

    const doc = await getDocumentWithChunks(id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (doc.tenantId !== tenantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return download URL (in production, generate a signed URL with expiry)
    return NextResponse.json({
      url: doc.fileUrl,
      fileName: doc.fileName,
      expiresIn: 3600,
    });
  } catch (err) {
    if (err instanceof AuthError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Failed to get download URL" }, { status: 500 });
  }
}
