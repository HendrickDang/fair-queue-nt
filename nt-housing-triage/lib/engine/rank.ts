import { buildBatches, type JobBatchInfo } from "./batching";
import { scoreEfficiency } from "./efficiency";
import { scoreNeed } from "./scoring";
import type {
  Batch,
  EfficiencyScore,
  EquitySummary,
  Job,
  NeedScore,
  RankOptions,
  RankResult,
  RankedJob,
} from "./types";

const HOURS_PER_DAY = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function minMax(values: number[]): (v: number) => number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (v) => (v - min) / range;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Anything the scheduler needs to estimate a start day. */
type Schedulable = { job: Job; efficiency: EfficiencyScore };

/** Estimate each job's start day by walking the queue and accumulating work. */
function simulateStartDays(order: Schedulable[]): Map<string, number> {
  let cumulativeHours = 0;
  const days = new Map<string, number>();
  for (const r of order) {
    cumulativeHours += r.efficiency.labourHours;
    days.set(r.job.id, cumulativeHours / HOURS_PER_DAY);
  }
  return days;
}

function isRemote(job: Job): boolean {
  return job.community.tier === "T2" || job.community.tier === "T3";
}

function medianRemoteDays(order: Schedulable[]): number {
  const days = simulateStartDays(order);
  const remoteDays = order
    .filter((r) => isRemote(r.job))
    .map((r) => days.get(r.job.id) ?? 0);
  return median(remoteDays);
}

function sortByNeed(a: { need: NeedScore; job: Job }, b: { need: NeedScore; job: Job }): number {
  if (b.need.score !== a.need.score) return b.need.score - a.need.score;
  // Older reports win ties.
  return a.job.reportedAt.localeCompare(b.job.reportedAt);
}

function sortByEfficiency(
  a: { efficiency: EfficiencyScore },
  b: { efficiency: EfficiencyScore },
): number {
  return a.efficiency.score - b.efficiency.score;
}

/**
 * Rank a set of jobs on two independent axes and surface the tension:
 *   - need rank       (location-blind, human-centric)
 *   - efficiency rank (logistics: travel + duration − batching)
 *   - equity gap      = need rank − efficiency rank
 *
 * The equity dial λ (0 = pure fair, 1 = pure efficient) re-ranks live and the
 * summary reports the human cost of moving toward efficiency.
 */
export function rankJobs(jobs: Job[], options: RankOptions = {}): RankResult {
  const lambda = clamp(options.lambda ?? 0, 0, 1);
  const useBatching = options.batching ?? true;
  const { batches, info } = useBatching
    ? buildBatches(jobs)
    : { batches: [] as Batch[], info: new Map<string, JobBatchInfo>() };

  const scored = jobs.map((job) => ({
    job,
    need: scoreNeed(job),
    efficiency: scoreEfficiency(job, info.get(job.id) ?? {
      batch: null,
      bonusCost: 0,
      bonusKm: 0,
      bonusHours: 0,
    }),
  }));

  const needOrder = [...scored].sort(sortByNeed);
  const efficiencyOrder = [...scored].sort(sortByEfficiency);

  const needRank = new Map<string, number>();
  needOrder.forEach((s, i) => needRank.set(s.job.id, i + 1));
  const efficiencyRank = new Map<string, number>();
  efficiencyOrder.forEach((s, i) => efficiencyRank.set(s.job.id, i + 1));

  const needNorm = minMax(scored.map((s) => s.need.score));
  const effNorm = minMax(scored.map((s) => s.efficiency.score));

  const ranked: RankedJob[] = scored
    .map((s) => {
      const nr = needRank.get(s.job.id)!;
      const er = efficiencyRank.get(s.job.id)!;
      const adjustedScore =
        (1 - lambda) * needNorm(s.need.score) - lambda * effNorm(s.efficiency.score);
      return {
        job: s.job,
        need: s.need,
        efficiency: s.efficiency,
        needRank: nr,
        efficiencyRank: er,
        // Positive when logistics pushes a job *down* the queue (remote jobs).
        equityGap: er - nr,
        adjustedScore,
        finalRank: 0,
        movedByDial: 0,
        estimatedStartDays: 0,
        batch: info.get(s.job.id)?.batch ?? null,
      } satisfies RankedJob;
    })
    .sort((a, b) => {
      if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
      return a.needRank - b.needRank;
    });

  const startDays = simulateStartDays(ranked);
  ranked.forEach((r, i) => {
    r.finalRank = i + 1;
    r.movedByDial = r.finalRank - r.needRank;
    r.estimatedStartDays = startDays.get(r.job.id) ?? 0;
  });

  const gaps = ranked.map((r) => r.equityGap);
  const travelSavedByBatching = ranked.reduce((sum, r) => sum + r.efficiency.batchingBonus, 0);

  const summary: EquitySummary = {
    lambda,
    jobCount: ranked.length,
    penalisedCount: gaps.filter((g) => g > 0).length,
    worstGap: gaps.length ? Math.max(...gaps) : 0,
    medianGap: median(gaps),
    medianDaysRemote: medianRemoteDays(ranked),
    addedMedianDaysRemote: medianRemoteDays(ranked) - medianRemoteDays(needOrder),
    travelSavedByBatching,
  };

  const byId: Record<string, RankedJob> = {};
  for (const r of ranked) byId[r.job.id] = r;

  return { lambda, ranked, batches, byId, summary };
}
