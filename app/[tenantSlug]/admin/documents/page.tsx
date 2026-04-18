"use client";

import { useEffect, useState } from "react";

type Doc = {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  storageProvider: string;
  createdAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-white/40 bg-white/5",
  processing: "text-amber-300 bg-amber-300/10",
  ready: "text-emerald-300 bg-emerald-300/10",
  failed: "text-rose-300 bg-rose-300/10",
  uploaded: "text-cyan-300 bg-cyan-300/10",
};

function fmt(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TenantDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetch("/api/tenant/documents?limit=100")
      .then((r) => r.json())
      .catch(() => ({ documents: [] })) as { documents?: Doc[] };
    setDocs(data.documents ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-white">Documents</h1>
          <p className="text-sm text-white/50">Uploaded and indexed files</p>
        </div>
        <button onClick={load}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 transition hover:border-white/40 hover:text-white">
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-white/40">Loading...</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center text-sm text-white/40">No documents yet. Upload a PDF from the app.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-white/30">
                <th className="px-4 py-3 text-left">File</th>
                <th className="px-4 py-3 text-left">Size</th>
                <th className="px-4 py-3 text-left">Storage</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3 text-white max-w-50 truncate" title={d.fileName}>{d.fileName}</td>
                  <td className="px-4 py-3 text-white/50 text-xs">{fmt(d.fileSize)}</td>
                  <td className="px-4 py-3 text-white/50 text-xs capitalize">{d.storageProvider}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[d.status] ?? "text-white/40"}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/40 text-xs">{new Date(d.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
