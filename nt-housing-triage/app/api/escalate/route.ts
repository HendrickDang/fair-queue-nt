import { NextResponse } from "next/server";
import { appendAudit, getReport } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A tenant (or coordinator) escalates a repair. This is the persisted half of
 * the trust twist: the request to escalate is written to the audit trail so the
 * decision history is complete and replayable.
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
  if (!getReport(reportId)) {
    return NextResponse.json({ error: "unknown report" }, { status: 404 });
  }

  const actor = typeof p.actor === "string" && p.actor.trim() ? p.actor.trim() : "tenant";
  const reason =
    typeof p.reason === "string" && p.reason.trim()
      ? p.reason.trim()
      : "Tenant asked to escalate.";
  const id = appendAudit({ actor, action: "escalate", detail: `${reportId}: ${reason}` });

  return NextResponse.json({ id, reportId });
}
