import { NextRequest, NextResponse } from "next/server";
import { askQuestion, streamAskQuestion } from "@/lib/rag";
import { runAgent } from "@/lib/agent/executor";
import type { ConversationTurn } from "@/lib/router";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, history, mode } = body as {
      question?: string;
      history?: ConversationTurn[];
      mode?: "json" | "stream" | "agent";
    };

    if (!question || typeof question !== "string" || question.trim() === "") {
      return NextResponse.json(
        { error: "Question required" },
        { status: 400 }
      );
    }

    const safeHistory = Array.isArray(history) ? history : [];

    if (mode === "agent") {
      // Stream agent steps as NDJSON
      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const step of runAgent(question, safeHistory)) {
              controller.enqueue(encoder.encode(JSON.stringify(step) + "\n"));
            }
          } finally {
            controller.close();
          }
        },
      });
      return new Response(readable, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    if (mode === "stream") {
      const stream = streamAskQuestion(question, safeHistory);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await askQuestion(question, safeHistory);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}