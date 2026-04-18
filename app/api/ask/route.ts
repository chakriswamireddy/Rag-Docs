import { NextRequest, NextResponse } from "next/server";
import { askQuestion, streamAskQuestion } from "@/lib/rag";
import { runAgent } from "@/lib/agent/executor";
import { auth } from "@/lib/auth";
import { askSchema, validate } from "@/lib/validation";
import { checkQueryLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const ctx = {
      tenantId: session?.user?.tenantId ?? null,
      userId: session?.user?.id ?? null,
    };

    // Rate limit
    if (ctx.tenantId) {
      const limit = checkQueryLimit(ctx.tenantId);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Rate limit exceeded" },
          { status: 429, headers: { "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 0) / 1000)) } }
        );
      }
    }

    const body = await req.json();
    const parsed = validate(askSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { question, history: safeHistory, mode } = parsed.data;

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
      const stream = streamAskQuestion(question, safeHistory, ctx);
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await askQuestion(question, safeHistory, ctx);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to answer" }, { status: 500 });
  }
}