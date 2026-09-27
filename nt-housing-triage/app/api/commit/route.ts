import { NextResponse } from "next/server";
import { createSchedule, listSchedulesWithJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface JobPayload {
  id?: unknown;
  position?: unknown;
  needRank?: unknown;
  efficiencyRank?: unknown;
  equityGap?: unknown;
  rationale?: unknown;
}

/**
 * Commit a schedule. The client posts the ranked order at the chosen equity
 * dial; the server writes the schedule, its jobs, and the audit entry in one
 * transaction, then returns the refreshed history.
 */
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const lambda = typeof p.lambda === "number" ? p.lambda : Number(p.lambda);
  if (!Number.isFinite(lambda)) {
    return NextResponse.json({ error: "lambda must be a number" }, { status: 400 });
  }

  const rawJobs = Array.isArray(p.jobs) ? (p.jobs as JobPayload[]) : [];
  const jobs = rawJobs
    .filter((j) => typeof j?.id === "string" && (j.id as string).trim())
    .map((j, index) => {
      const position =
        typeof j.position === "number" && Number.isFinite(j.position) ? j.position : index + 1;
      const needRank = typeof j.needRank === "number" ? j.needRank : undefined;
      const efficiencyRank = typeof j.efficiencyRank === "number" ? j.efficiencyRank : undefined;
      const equityGap = typeof j.equityGap === "number" ? j.equityGap : undefined;
      const rationale =
        typeof j.rationale === "string" && j.rationale.trim()
          ? j.rationale.trim()
          : `#${needRank ?? "?"} on need, #${efficiencyRank ?? "?"} on logistics (gap ${
              equityGap ?? "?"
            }); placed #${position}.`;
      return { reportId: (j.id as string).trim(), position, rationale, needRank, efficiencyRank, equityGap };
    });

  if (jobs.length === 0) {
    return NextResponse.json({ error: "at least one job is required" }, { status: 400 });
  }

  const narrative = typeof p.narrative === "string" ? p.narrative : "";
  const actor =
    typeof p.actor === "string" && p.actor.trim() ? p.actor.trim() : "coordinator";

  const id = createSchedule({
    lambda: clamp(lambda, 0, 1),
    costNote: narrative,
    detail: narrative || `Committed schedule at λ=${clamp(lambda, 0, 1)}`,
    actor,
    action: "commit",
    jobs,
  });

  return NextResponse.json({ id, schedules: listSchedulesWithJobs(10) });
}
