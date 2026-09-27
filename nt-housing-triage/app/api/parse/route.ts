import { NextResponse } from "next/server";
import { parseReport } from "@/lib/parser";
import { getCommunity } from "@/lib/data/communities";
import { insertReport } from "@/lib/db";

// Reads/writes the local SQLite file, so never cache.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const payload = (body ?? {}) as {
    text?: unknown;
    prefer?: unknown;
    id?: unknown;
    community?: unknown;
  };
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const prefer = payload.prefer === "fallback" ? "fallback" : "model";
  const overrideCommunity =
    typeof payload.community === "string" ? payload.community.trim() : "";

  const result = await parseReport(text, { prefer });

  // If the text never named a known community, fall back to one the coordinator
  // picked explicitly so the report can still be placed on the map.
  if (!getCommunity(result.community)) {
    const chosen = getCommunity(overrideCommunity);
    if (chosen) result.community = chosen.name;
  }

  // Persist the report so it survives a reload and feeds the audit trail.
  // A storage hiccup must not break parsing, so failures are logged, not thrown.
  try {
    const community = getCommunity(result.community);
    const id =
      typeof payload.id === "string" && payload.id.trim()
        ? payload.id.trim()
        : `JOB-${Date.now().toString(36)}`;
    insertReport({
      id,
      rawText: text.trim(),
      report: result,
      household: result.community ? `${result.community} (new)` : "new report",
      reportedAt: new Date().toISOString(),
      communityId: community?.id ?? null,
      tier: community?.tier ?? null,
    });
  } catch (error) {
    console.error("nt-triage: failed to persist report", error);
  }

  return NextResponse.json(result);
}
