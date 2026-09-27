import type { AccessMode, ParsedReport } from "@/lib/taxonomy";
import type { Community, TradeBase } from "@/lib/data/communities";

/** A raw incoming report plus its parsed structure. */
export interface JobInput {
  id: string;
  rawText: string;
  report: ParsedReport;
  reportedAt: string;
  /** Optional household reference shown to the tenant. */
  household?: string;
}

/** A job resolved against the community / trade-base dataset. */
export interface Job extends JobInput {
  community: Community;
  base: TradeBase;
}

export interface NeedScore {
  score: number;
  safetyScore: number;
  flagScore: number;
  vulnerabilityMultiplier: number;
  drivers: string[];
}

export interface EfficiencyScore {
  score: number;
  travelKm: number;
  travelHours: number;
  travelCost: number;
  labourHours: number;
  labourCost: number;
  batchingBonus: number;
  mode: AccessMode;
  drivers: string[];
}

export interface Batch {
  id: string;
  label: string;
  communityIds: string[];
  communityNames: string[];
  jobIds: string[];
  mode: AccessMode;
  /** Solo cost if each community was visited separately. */
  soloCost: number;
  /** Cost of one combined trip covering the cluster. */
  batchCost: number;
  savedCost: number;
  savedKm: number;
  savedHours: number;
}

export interface RankedJob {
  job: Job;
  need: NeedScore;
  efficiency: EfficiencyScore;
  needRank: number;
  efficiencyRank: number;
  /** efficiencyRank - needRank. Positive => logistics pushed it down the queue. */
  equityGap: number;
  /** Combined score at the active dial (higher is better). */
  adjustedScore: number;
  finalRank: number;
  /** finalRank - needRank. How far the dial moved it from pure need. */
  movedByDial: number;
  /** Estimated start in working days from today, walking the queue. */
  estimatedStartDays: number;
  batch: Batch | null;
}

export interface EquitySummary {
  lambda: number;
  jobCount: number;
  /** Jobs whose efficiency rank is materially worse than their need rank. */
  penalisedCount: number;
  worstGap: number;
  medianGap: number;
  /** Median estimated wait (days) for remote (T2/T3) households at this dial. */
  medianDaysRemote: number;
  /** Extra median days the dial adds for remote households vs pure need. */
  addedMedianDaysRemote: number;
  /** Travel cost avoided by batching across the whole queue. */
  travelSavedByBatching: number;
}

export interface RankResult {
  lambda: number;
  ranked: RankedJob[];
  batches: Batch[];
  byId: Record<string, RankedJob>;
  summary: EquitySummary;
}

export interface RankOptions {
  lambda?: number;
  /** Set false to rank as if every job were a separate solo trip. */
  batching?: boolean;
}
