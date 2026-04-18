"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Citation = {
  documentName: string;
  section: string;
  page: number;
  chunkPreview: string;
};

type HistoryItem = {
  id: string;
  question: string;
  answer: string;
  sources?: Array<Record<string, unknown>>;
  citations?: Citation[];
  queryType?: string;
  createdAt: string;
};

const HISTORY_STORAGE_KEY = "rag-history-v1";
const MAX_HISTORY_CONTEXT = 6;

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildHistoryContext(history: HistoryItem[]) {
  const slice = history.slice(-MAX_HISTORY_CONTEXT);
  if (slice.length === 0) return "";

  return slice
    .map((item, index) => {
      const number = index + 1;
      return `Turn ${number}\nQ: ${item.question}\nA: ${item.answer}`;
    })
    .join("\n\n");
}

const MAX_FILE_SIZE_MB = 3;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [storageProvider, setStorageProvider] = useState<"cloudflare" | "aws">(
    "cloudflare"
  );
  const [uploadState, setUploadState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [askState, setAskState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [askMessage, setAskMessage] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [streamingAnswer, setStreamingAnswer] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as HistoryItem[];
      if (Array.isArray(parsed)) {
        setHistory(parsed);
      }
    } catch {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const historyContext = useMemo(
    () => (includeHistory ? buildHistoryContext(history) : ""),
    [history, includeHistory]
  );

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setUploadState("error");
      setUploadMessage("Please choose a PDF file first.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadState("error");
      setUploadMessage(`File exceeds the ${MAX_FILE_SIZE_MB} MB limit.`);
      return;
    }

    setUploadState("loading");
    setUploadMessage("Uploading and indexing...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("storageProvider", storageProvider);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? "Upload failed.");
      }

      setUploadState("success");
      setUploadMessage("Indexed. You can ask questions now.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed."
      );
    }
  }

  async function handleAsk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    setAskState("loading");
    setAskMessage("Thinking...");
    setStreamingAnswer("");

    // Build history payload for the API (last MAX_HISTORY_CONTEXT turns)
    const historyPayload = includeHistory
      ? history.slice(-MAX_HISTORY_CONTEXT).map((h) => ({
          question: h.question,
          answer: h.answer,
        }))
      : [];

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          history: historyPayload,
          mode: "stream",
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(
          (data as { error?: string } | null)?.error ?? "Failed to answer."
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let finalSources: Array<Record<string, unknown>> = [];
      let finalCitations: Citation[] = [];
      let finalQueryType: string = "factual";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type: string;
              content?: string;
              sources?: Array<Record<string, unknown>>;
              citations?: Citation[];
              queryType?: string;
              message?: string;
            };
            if (event.type === "meta") {
              finalSources = event.sources ?? [];
              finalCitations = event.citations ?? [];
              finalQueryType = event.queryType ?? "factual";
            } else if (event.type === "token" && event.content) {
              accumulated += event.content;
              setStreamingAnswer(accumulated);
            } else if (event.type === "error") {
              throw new Error(event.message ?? "Stream error");
            }
          } catch {
            // Malformed line — skip
          }
        }
      }

      const item: HistoryItem = {
        id: makeId(),
        question: trimmed,
        answer: accumulated || "No answer returned.",
        sources: finalSources,
        citations: finalCitations,
        queryType: finalQueryType,
        createdAt: new Date().toISOString(),
      };

      setHistory((prev) => [...prev, item]);
      setStreamingAnswer("");
      setAskState("success");
      setAskMessage("Answer ready.");
      setQuestion("");
    } catch (error) {
      setStreamingAnswer("");
      setAskState("error");
      setAskMessage(
        error instanceof Error ? error.message : "Failed to answer."
      );
    }
  }

  function handleClearHistory() {
    setHistory([]);
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <span className="text-sm text-white/40">Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/40 blur-[110px]" />
        <div className="absolute top-40 right-10 h-80 w-80 rounded-full bg-cyan-400/20 blur-[120px]" />
        <div className="absolute bottom-20 left-10 h-72 w-72 rounded-full bg-rose-400/20 blur-[120px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16 pt-14 sm:px-10">
        <header className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="inline-flex w-fit items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
              Rag Studio
            </div>
            {!session && (
              <Link
                href="/auth/signin"
                className="rounded-full border border-white/15 px-4 py-2 text-xs text-white/60 transition hover:border-white/40 hover:text-white"
              >
                Sign in to save queries
              </Link>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Your documents, stitched into a living memory.
            </h1>
            <p className="max-w-2xl text-base text-white/70 sm:text-lg">
              Upload a PDF, ask a question, and keep every response on hand.
              History is saved in your browser and can be injected into the next
              question for better continuity.
            </p>
          </div>
        </header>

        <main className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-8">
            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold text-white">
                    Upload & index
                  </h2>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
                    PDF only
                  </span>
                </div>
                <form className="flex flex-col gap-4" onSubmit={handleUpload}>
                  <label className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 p-4 text-white/70 transition hover:border-white/40">
                    <span className="text-sm uppercase tracking-widest text-white/50">
                      Choose file
                    </span>
                    <div className="text-base text-white">
                      {file ? file.name : "Drop a PDF or click to browse."}
                    </div>
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(event) => {
                        const picked = event.target.files?.[0] ?? null;
                        if (picked && picked.size > MAX_FILE_SIZE_BYTES) {
                          setUploadState("error");
                          setUploadMessage(`File exceeds the ${MAX_FILE_SIZE_MB} MB limit.`);
                          setFile(null);
                          event.target.value = "";
                        } else {
                          setUploadState("idle");
                          setUploadMessage("");
                          setFile(picked);
                        }
                      }}
                    />
                  </label>

                  {/* Storage provider toggle */}
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                    <span className="text-xs text-white/50 uppercase tracking-widest mr-1">
                      Storage
                    </span>
                    <button
                      type="button"
                      onClick={() => setStorageProvider("cloudflare")}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        storageProvider === "cloudflare"
                          ? "bg-amber-300 text-zinc-900"
                          : "border border-white/15 text-white/60 hover:border-white/40 hover:text-white"
                      }`}
                    >
                      Cloudflare R2
                    </button>
                    <button
                      type="button"
                      onClick={() => setStorageProvider("aws")}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                        storageProvider === "aws"
                          ? "bg-cyan-300 text-zinc-900"
                          : "border border-white/15 text-white/60 hover:border-white/40 hover:text-white"
                      }`}
                    >
                      AWS S3
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={uploadState === "loading"}
                      className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadState === "loading" ? "Indexing..." : "Upload"}
                    </button>
                    <span
                      className={`text-sm ${{
                        idle: "text-white/60",
                        loading: "text-amber-200",
                        success: "text-emerald-200",
                        error: "text-rose-200",
                      }[uploadState]}`}
                    >
                      {uploadMessage || "No file indexed yet."}
                    </span>
                  </div>
                </form>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold text-white">
                    Ask the archive
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-white/60">
                    <input
                      type="checkbox"
                      checked={includeHistory}
                      onChange={(event) => setIncludeHistory(event.target.checked)}
                      className="h-4 w-4 rounded border-white/30 bg-white/10 text-amber-300"
                    />
                    Include recent history
                  </label>
                </div>

                <form className="flex flex-col gap-4" onSubmit={handleAsk}>
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    rows={4}
                    placeholder="Ask anything about the indexed document..."
                    className="w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-amber-200 focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={askState === "loading"}
                      className="rounded-full bg-amber-300 px-5 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {askState === "loading" ? "Asking..." : "Ask"}
                    </button>
                    <span
                      className={`text-sm ${{
                        idle: "text-white/60",
                        loading: "text-amber-200",
                        success: "text-emerald-200",
                        error: "text-rose-200",
                      }[askState]}`}
                    >
                      {askMessage || "Waiting for your question."}
                    </span>
                  </div>
                </form>

                {includeHistory && historyContext ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-white/40">
                      Context injected
                    </div>
                    <pre className="whitespace-pre-wrap font-mono">
                      {historyContext}
                    </pre>
                  </div>
                ) : null}

                {streamingAnswer ? (
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-white/90">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-amber-300/60">
                      Streaming answer
                    </div>
                    <p className="whitespace-pre-wrap">{streamingAnswer}</p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">History</h2>
              <button
                type="button"
                onClick={handleClearHistory}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 transition hover:border-white/40 hover:text-white"
              >
                Clear
              </button>
            </div>

            {history.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 text-sm text-white/60">
                Ask a question to start building a trail of answers.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {history
                  .slice()
                  .reverse()
                  .map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4"
                    >
                      <div className="text-xs uppercase tracking-[0.3em] text-white/40">
                        {new Date(item.createdAt).toLocaleString()}
                        {item.queryType ? (
                          <span className="ml-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-amber-300/70">
                            {item.queryType}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-white">
                        {item.question}
                      </h3>
                      <p className="mt-2 text-sm text-white/75">{item.answer}</p>
                      {item.citations?.length ? (
                        <div className="mt-3 flex flex-col gap-2">
                          <div className="text-[10px] uppercase tracking-[0.25em] text-white/40">
                            Citations
                          </div>
                          {item.citations.map((c, i) => (
                            <div
                              key={i}
                              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-white/80 truncate">{c.documentName}</span>
                                {c.page > 0 && (
                                  <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-white/40">
                                    p.{c.page}
                                  </span>
                                )}
                              </div>
                              {c.section && (
                                <p className="mt-0.5 text-white/50">{c.section}</p>
                              )}
                              <p className="mt-1 text-white/40 line-clamp-2">{c.chunkPreview}</p>
                            </div>
                          ))}
                        </div>
                      ) : item.sources?.length ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-white/40">
                            Sources
                          </div>
                          <ul className="flex flex-col gap-1">
                            {item.sources.map((s, i) => (
                              <li key={i} className="truncate font-mono">{String((s as Record<string, unknown>).id ?? JSON.stringify(s))}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </article>
                  ))}
              </div>
            )}
          </aside>
        </main>
      </div>
    </div>
  );
}
