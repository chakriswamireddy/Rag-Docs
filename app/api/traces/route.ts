import { NextRequest, NextResponse } from "next/server";
import { getRecentTraces } from "@/lib/telemetry";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const last = Math.min(Number(url.searchParams.get("last") ?? "50"), 200);
  const traces = getRecentTraces(isNaN(last) ? 50 : last);
  return NextResponse.json({ traces, count: traces.length });
}
