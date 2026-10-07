import { describe, expect, it } from "vitest";
import { rankJobs } from "@/lib/engine/rank";
import { seedJobs } from "@/lib/data/seed";
import { AGEING_POINTS_PER_DAY } from "@/lib/taxonomy";
import { dialSweep, isRemote, needBreakdown, rankShift } from "@/lib/viz";

// The charts must never disagree with the engine, so every helper is checked
// against rankJobs on the seeded queue.
const jobs = seedJobs();
const options = { ageing: AGEING_POINTS_PER_DAY, now: "2026-10-07T09:00:00+09:30" };

describe("dialSweep", () => {
  const sweep = dialSweep(jobs, options);

  it("covers the dial from 0 to 1 in steps of 0.05", () => {
    expect(sweep.points).toHaveLength(21);
    expect(sweep.points[0].lambda).toBe(0);
    expect(sweep.points[8].lambda).toBe(0.4);
    expect(sweep.points[20].lambda).toBe(1);
  });

  it("matches the engine's own median remote wait at every setting", () => {
    for (const p of sweep.points) {
      const { summary } = rankJobs(jobs, { ...options, lambda: p.lambda });
      expect(p.remote).toBeCloseTo(summary.medianDaysRemote, 10);
    }
  });

  it("counts every job as either town or remote", () => {
    expect(sweep.townCount + sweep.remoteCount).toBe(jobs.length);
    expect(sweep.remoteCount).toBe(jobs.filter(isRemote).length);
  });
});

describe("rankShift", () => {
  it("gives every job one position in each column", () => {
    const current = rankJobs(jobs, { ...options, lambda: 0.4 });
    const rows = rankShift(jobs, current, options);
    const expected = jobs.map((_, i) => i + 1);
    for (const key of ["needRank", "dialRank", "costRank"] as const) {
      expect(rows.map((r) => r[key]).sort((a, b) => a - b)).toEqual(expected);
    }
    for (const row of rows) {
      expect(row.dialRank).toBe(current.byId[row.id].finalRank);
      expect(row.needRank).toBe(current.byId[row.id].needRank);
    }
  });

  it("shows no movement in the middle column when the dial is at 0", () => {
    const current = rankJobs(jobs, { ...options, lambda: 0 });
    for (const row of rankShift(jobs, current, options)) {
      expect(row.dialRank).toBe(row.needRank);
    }
  });
});

describe("needBreakdown", () => {
  it("has parts that sum to the need score for every job", () => {
    const { ranked } = rankJobs(jobs, options);
    for (const r of ranked) {
      const { parts, total } = needBreakdown(r.need);
      expect(parts.reduce((sum, p) => sum + p.points, 0)).toBeCloseTo(r.need.score, 10);
      expect(total).toBe(r.need.score);
      expect(parts.every((p) => p.points >= 0)).toBe(true);
    }
  });
});
