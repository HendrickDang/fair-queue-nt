/**
 * Pure helpers behind the dashboard charts.
 *
 * Nothing here scores or ranks anything: every number comes from `rankJobs`,
 * so a chart can never disagree with the queue it sits beside.
 */
import { rankJobs } from "@/lib/engine/rank";
import type { Job, NeedScore, RankOptions, RankResult } from "@/lib/engine/types";
import { TIER_LABEL } from "@/lib/data/communities";
import type { SafetyLevel } from "@/lib/taxonomy";

type SweepOptions = Omit<RankOptions, "lambda">;

/** Remote = tier T2 or T3, the same definition the engine's summary uses. */
export function isRemote(job: Job): boolean {
  return job.community.tier === "T2" || job.community.tier === "T3";
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/* ------------------------------------------------------------------------ */
/* 1. Dial sweep: who waits at every dial setting                            */
/* ------------------------------------------------------------------------ */

export interface SweepPoint {
  lambda: number;
  /** Median estimated start (working days) for town and regional households. */
  town: number;
  /** Median estimated start (working days) for remote households. */
  remote: number;
}

export interface DialSweep {
  points: SweepPoint[];
  townCount: number;
  remoteCount: number;
}

/**
 * Re-rank the same queue at every dial setting (0, 0.05 ... 1) and record the
 * median estimated start day for town and for remote households. This is the
 * consequence of the dial, shown before the coordinator commits to a value.
 */
export function dialSweep(jobs: Job[], options: SweepOptions = {}, steps = 20): DialSweep {
  const points: SweepPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const lambda = Math.round((i / steps) * 100) / 100;
    const { ranked } = rankJobs(jobs, { ...options, lambda });
    points.push({
      lambda,
      town: median(ranked.filter((r) => !isRemote(r.job)).map((r) => r.estimatedStartDays)),
      remote: median(ranked.filter((r) => isRemote(r.job)).map((r) => r.estimatedStartDays)),
    });
  }
  return {
    points,
    townCount: jobs.filter((j) => !isRemote(j)).length,
    remoteCount: jobs.filter((j) => isRemote(j)).length,
  };
}

/* ------------------------------------------------------------------------ */
/* 2. Rank movement: need order, the current dial, and cost order            */
/* ------------------------------------------------------------------------ */

export interface ShiftRow {
  id: string;
  summary: string;
  community: string;
  tierLabel: string;
  remote: boolean;
  safety: SafetyLevel;
  /** Position when only need counts (dial at 0). */
  needRank: number;
  /** Position at the coordinator's current dial. */
  dialRank: number;
  /** Position when only travel cost counts (dial at 1). */
  costRank: number;
}

/**
 * Each job's position at three dial settings: need only, the current dial, and
 * cost only. `current` is the ranking the dashboard already shows, so the
 * middle column always matches the queue table.
 */
export function rankShift(jobs: Job[], current: RankResult, options: SweepOptions = {}): ShiftRow[] {
  const need = rankJobs(jobs, { ...options, lambda: 0 });
  const cost = rankJobs(jobs, { ...options, lambda: 1 });
  return need.ranked.map((r) => ({
    id: r.job.id,
    summary: r.job.report.summary,
    community: r.job.community.name,
    tierLabel: TIER_LABEL[r.job.community.tier],
    remote: isRemote(r.job),
    safety: r.job.report.safety_level,
    needRank: r.finalRank,
    dialRank: current.byId[r.job.id]?.finalRank ?? r.finalRank,
    costRank: cost.byId[r.job.id]?.finalRank ?? r.finalRank,
  }));
}

/* ------------------------------------------------------------------------ */
/* 3. Need score make-up                                                     */
/* ------------------------------------------------------------------------ */

export interface NeedPart {
  key: "safety" | "hazards" | "household" | "waiting";
  label: string;
  /** Need points this part adds. The parts always sum to the need score. */
  points: number;
}

/**
 * Split a need score into the points each input adds:
 *   score = (safety + hazards) x household multiplier + waiting
 * The household uplift is the extra the multiplier adds on top of safety and
 * hazards. Location is not an input, so it never appears here.
 */
export function needBreakdown(need: NeedScore): { parts: NeedPart[]; total: number } {
  const base = need.safetyScore + need.flagScore;
  const parts: NeedPart[] = [
    { key: "safety", label: "Safety level", points: need.safetyScore },
    { key: "hazards", label: "Hazards reported", points: need.flagScore },
    { key: "household", label: "Who lives there", points: base * (need.vulnerabilityMultiplier - 1) },
    { key: "waiting", label: "Days waiting", points: need.agePoints },
  ];
  return { parts, total: need.score };
}
