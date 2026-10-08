import { NextResponse } from "next/server";
import { markReportRead } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A person has read a report the system could not read. This lifts the
 * fail-safe hold and records who read it and what they decided.
 */
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const reportId = typeof p.reportId === "string" ? p.reportId.trim() : "";
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }
  const actor = typeof p.actor === "string" && p.actor.trim() ? p.actor.trim().slice(0, 120) : "coordinator";
  // The reader's judgement: "high" or "critical" raises the level; anything else confirms the parsed one.
  const level = p.level === "high" || p.level === "critical" ? p.level : null;

  if (!markReportRead({ id: reportId, level, actor })) {
    return NextResponse.json({ error: "unknown report" }, { status: 404 });
  }
  return NextResponse.json({ reportId, level });
}
