import { CATEGORY_DURATION_HOURS, TRADE_LABEL } from "@/lib/taxonomy";
import {
  LABOUR_COST_PER_HOUR,
  formatKm,
  roundTrip,
  travelLeg,
} from "@/lib/data/distances";
import type { JobBatchInfo } from "./batching";
import type { EfficiencyScore, Job } from "./types";

/**
 * Efficiency = the cost of doing the job now, given where it is.
 *
 * Travel is the dominant term for remote communities, which is exactly the
 * pressure the equity gap surfaces. Batching credits a share of the saved trip
 * cost back to the job, so grouping work is what closes the gap.
 */
export function scoreEfficiency(job: Job, batchInfo: JobBatchInfo): EfficiencyScore {
  const solo = roundTrip(travelLeg(job.base, job.community, job.community.access));

  const travelKm = Math.max(0, solo.km - batchInfo.bonusKm);
  const travelHours = Math.max(0, solo.hours - batchInfo.bonusHours);
  const travelCost = Math.max(0, solo.cost - batchInfo.bonusCost);

  const durationHours = CATEGORY_DURATION_HOURS[job.report.category];
  const labourHours = durationHours + travelHours;
  const labourCost = labourHours * LABOUR_COST_PER_HOUR;

  const score = travelCost + labourCost;

  const drivers: string[] = [
    `${formatKm(solo.km)} round trip from ${job.base.name} by ${solo.mode}`,
    `${durationHours} h on site`,
  ];
  if (batchInfo.batch) {
    drivers.push(
      `batched with ${batchInfo.batch.communityNames.join(" + ")} — ` +
        `saves ${Math.round(batchInfo.bonusCost)} in shared travel`,
    );
  } else {
    drivers.push("not batched — full solo trip");
  }

  return {
    score,
    travelKm,
    travelHours,
    travelCost,
    labourHours,
    labourCost,
    batchingBonus: batchInfo.bonusCost,
    mode: solo.mode,
    drivers,
  };
}

export function tradeLabel(job: Job): string {
  return TRADE_LABEL[job.report.trade_required];
}
