import { describe, expect, it } from "vitest";
import { rankJobs } from "@/lib/engine/rank";
import { buildJob } from "@/lib/engine/scoring";
import { seedJobs } from "@/lib/data/seed";
import { parseWithFallback } from "@/lib/parser/fallback";
import { AGEING_CAP, AGEING_POINTS_PER_DAY } from "@/lib/taxonomy";
import type { Job } from "@/lib/engine/types";

function job(id: string, text: string, reportedAt = "2026-09-20T00:00:00+09:30"): Job {
  const report = parseWithFallback(text);
  const { job: built, error } = buildJob({ id, rawText: text, reportedAt, report });
  if (!built) throw new Error(error);
  return built;
}

describe("rankJobs - equity gap", () => {
  const jobs = seedJobs();

  it("builds a job for every seeded report", () => {
    expect(jobs.length).toBeGreaterThanOrEqual(12);
  });

  it("ranks a remote critical job highly on need", () => {
    const result = rankJobs(jobs, { lambda: 0 });
    const wadeye = result.byId["JOB-1042"];
    expect(wadeye.job.community.name).toBe("Wadeye");
    expect(wadeye.needRank).toBeLessThanOrEqual(3);
  });

  it("shows logistics pushing the remote job down under pure efficiency", () => {
    const result = rankJobs(jobs, { lambda: 1 });
    const wadeye = result.byId["JOB-1042"];
    expect(wadeye.efficiencyRank).toBeGreaterThan(wadeye.needRank);
    expect(wadeye.equityGap).toBeGreaterThan(0);
  });

  it("recovers places for a batched remote job vs no batching", () => {
    const withBatching = rankJobs(jobs, { lambda: 1, batching: true });
    const without = rankJobs(jobs, { lambda: 1, batching: false });
    const recovered =
      without.byId["JOB-1042"].finalRank - withBatching.byId["JOB-1042"].finalRank;
    expect(recovered).toBeGreaterThan(0);
  });

  it("groups the West Daly jobs into one batch", () => {
    const result = rankJobs(jobs, { lambda: 0 });
    const wadeyeBatch = result.byId["JOB-1042"].batch;
    expect(wadeyeBatch).not.toBeNull();
    expect(wadeyeBatch!.jobIds).toContain("JOB-1043"); // Palumpa
    expect(wadeyeBatch!.jobIds).toContain("JOB-1044"); // Peppimenarti
    expect(wadeyeBatch!.savedCost).toBeGreaterThan(0);
  });

  it("is pure need at lambda 0", () => {
    const result = rankJobs(jobs, { lambda: 0 });
    for (const r of result.ranked) {
      expect(r.finalRank).toBe(r.needRank);
    }
  });

  it("reports a non-negative remote delay when moving to efficiency", () => {
    const fair = rankJobs(jobs, { lambda: 0 });
    const efficient = rankJobs(jobs, { lambda: 1 });
    expect(efficient.summary.addedMedianDaysRemote).toBeGreaterThanOrEqual(
      fair.summary.addedMedianDaysRemote,
    );
  });
});

describe("scoring", () => {
  it("scores a critical job above a low job", () => {
    const critical = rankJobs([job("a", "sparks coming out of the powerpoint in Darwin")], {
      lambda: 0,
    });
    const low = rankJobs([job("b", "tap is dripping in Darwin")], { lambda: 0 });
    expect(critical.ranked[0].need.score).toBeGreaterThan(low.ranked[0].need.score);
  });

  it("assigns an estimated start day to every job", () => {
    const result = rankJobs(seedJobs(), { lambda: 0.4 });
    for (const r of result.ranked) {
      expect(r.estimatedStartDays).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("buildBatches - credits", () => {
  it("never credits more than the batch actually saves", async () => {
    const { buildBatches } = await import("@/lib/engine/batching");
    // Two jobs in Wadeye plus one in Palumpa: the Wadeye share must be split.
    const jobs = [
      job("A", "roof caving over the bedroom, Wadeye"),
      job("B", "no water at all, Wadeye"),
      job("C", "sparks coming out of the powerpoint, Palumpa"),
    ];
    const { batches, info } = buildBatches(jobs);
    for (const b of batches) {
      const credited = b.jobIds.reduce((s, id) => s + (info.get(id)?.bonusCost ?? 0), 0);
      expect(credited).toBeCloseTo(b.savedCost, 6);
    }
  });
});

describe("ageing - waiting time raises priority", () => {
  const now = "2026-10-01T00:00:00+09:30";
  // Same report, same community, same safety - only the submit date differs.
  const older = job("OLD", "tap leaking under the sink, Darwin", "2026-09-01T00:00:00+09:30");
  const newer = job("NEW", "tap leaking under the sink, Darwin", "2026-09-30T00:00:00+09:30");

  it("is off by default, so a plain rankJobs call adds no age points", () => {
    const result = rankJobs([older, newer]);
    expect(result.ageing).toBe(0);
    expect(result.ranked.every((r) => r.need.agePoints === 0)).toBe(true);
  });

  it("gives an older report more age points than a newer one of equal need", () => {
    const result = rankJobs([older, newer], { ageing: AGEING_POINTS_PER_DAY, now });
    expect(result.byId["OLD"].need.agePoints).toBeGreaterThan(result.byId["NEW"].need.agePoints);
    expect(result.byId["OLD"].need.agePoints).toBeGreaterThan(0);
  });

  it("caps the age bonus so a routine report cannot outrank a fresh urgent one", () => {
    const urgentNew = job(
      "URGENT",
      "sparks coming out of the powerpoint, Darwin",
      "2026-09-30T00:00:00+09:30",
    );
    const routineOld = job("ROUTINE", "tap leaking under the sink, Darwin", "2020-01-01T00:00:00+09:30");
    const result = rankJobs([urgentNew, routineOld], { ageing: AGEING_POINTS_PER_DAY, now });
    expect(result.byId["ROUTINE"].need.agePoints).toBe(AGEING_CAP);
    expect(result.ranked[0].job.id).toBe("URGENT");
  });

  it("is deterministic for a fixed reference time", () => {
    const a = rankJobs([older, newer], { ageing: AGEING_POINTS_PER_DAY, now });
    const b = rankJobs([older, newer], { ageing: AGEING_POINTS_PER_DAY, now });
    expect(a.ranked.map((r) => r.job.id)).toEqual(b.ranked.map((r) => r.job.id));
  });
});
