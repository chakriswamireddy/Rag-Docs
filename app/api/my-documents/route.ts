import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAccessibleDocuments } from "@/lib/services/document.service";

/**
 * GET /api/my-documents
 *
 * Lists the documents the signed-in principal can query — tenant-scoped for
 * tenant users, user-scoped for tenant-less accounts (e.g. the test user).
 * Used by the upload/ask UI to populate the document picker.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await listAccessibleDocuments({
    tenantId: session.user.tenantId ?? null,
    userId: session.user.id ?? null,
  });

  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      status: d.status,
      totalChunks: d.totalChunks,
      createdAt: d.createdAt,
    })),
  });
}
