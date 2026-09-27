import { CATEGORY_LABEL, SAFETY_LABEL } from "@/lib/taxonomy";
import { formatAud, formatKm } from "@/lib/data/distances";
import type { EquitySummary, RankedJob } from "@/lib/engine/types";

/**
 * Grounded explainer.
 *
 * Every sentence is built from numbers that already exist on the RankedJob.
 * The explainer never invents a figure, so a fairness explanation can never
 * hallucinate. Optional tone-polishing by a model must keep these facts intact.
 */

export interface WhyCard {
  headline: string;
  needSentence: string;
  gapSentence: string | null;
  batchSentence: string | null;
  facts: string[];
}

export function whyCard(
  r: RankedJob,
  noBatchById?: Record<string, RankedJob>,
): WhyCard {
  const needSentence = `${SAFETY_LABEL[r.job.report.safety_level]} safety — ${r.need.drivers
    .slice(0, 3)
    .join(", ")}.`;

  let gapSentence: string | null = null;
  if (r.equityGap > 0) {
    gapSentence = `#${r.needRank} on need, #${r.efficiencyRank} after logistics — logistics pushed it down ${r.equityGap} place${r.equityGap === 1 ? "" : "s"}.`;
  } else if (r.equityGap < 0) {
    gapSentence = `#${r.needRank} on need, #${r.efficiencyRank} after logistics — logistics favours this job.`;
  } else {
    gapSentence = `#${r.needRank} on need and #${r.efficiencyRank} on logistics — no equity gap.`;
  }

  let batchSentence: string | null = null;
  if (r.batch) {
    let recovery = 0;
    if (noBatchById?.[r.job.id]) {
      recovery = noBatchById[r.job.id].finalRank - r.finalRank;
    }
    const saved = `saving ${formatAud(r.batch.savedCost)} of shared travel`;
    batchSentence =
      recovery > 0
        ? `Batched as "${r.batch.label}" — recovers ${recovery} place${recovery === 1 ? "" : "s"}, ${saved}.`
        : `Batched as "${r.batch.label}" — ${saved}.`;
  }

  return {
    headline: `${CATEGORY_LABEL[r.job.report.category]} · ${r.job.community.name} · queue #${r.finalRank}`,
    needSentence,
    gapSentence,
    batchSentence,
    facts: r.efficiency.drivers,
  };
}

export interface TenantAnswer {
  headline: string;
  body: string[];
  escalation: string;
}

function addWorkingDays(from: Date, days: number): Date {
  const date = new Date(from);
  let remaining = Math.max(0, Math.ceil(days));
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}

export function formatVisitDate(days: number, today = new Date()): string {
  return addWorkingDays(today, days).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Plain-language answer a tenant can read. Honest about *why* a job sits where
 * it does, and never pretends the trade-off is not happening.
 */
export function tenantAnswer(
  r: RankedJob,
  options: { today?: Date; lambda?: number; total?: number } = {},
): TenantAnswer {
  const today = options.today ?? new Date();
  const total = options.total ?? undefined;

  const headline = `Your repair is #${r.finalRank}${total ? ` of ${total}` : ""} in the queue`;
  const body: string[] = [
    `Report: ${r.job.report.summary} (${r.job.community.name}).`,
    `It is rated ${SAFETY_LABEL[r.job.report.safety_level].toLowerCase()} priority on safety.`,
  ];

  if (r.movedByDial > 0) {
    body.push(
      `It moved down ${r.movedByDial} place${r.movedByDial === 1 ? "" : "s"} because this week's schedule weighted travel efficiency more heavily.`,
    );
  } else if (r.movedByDial < 0) {
    body.push(
      `It moved up ${Math.abs(r.movedByDial)} place${r.movedByDial === -1 ? "" : "s"} because its safety need outweighed travel cost.`,
    );
  }

  if (r.batch) {
    body.push(
      `It is grouped with ${r.batch.jobIds.length - 1} other job${r.batch.jobIds.length - 1 === 1 ? "" : "s"} on a single run through ${r.batch.communityNames.join(" and ")}.`,
    );
  } else if (r.efficiency.travelKm > 0) {
    body.push(
      `The nearest trade base is ${formatKm(r.efficiency.travelKm)} away, which is why logistics alone would place it lower.`,
    );
  }

  body.push(`Earliest expected visit: ${formatVisitDate(r.estimatedStartDays, today)}.`);

  return {
    headline,
    body,
    escalation: "If this becomes an emergency, call the housing maintenance line and quote your job number to escalate.",
  };
}

/** One-line honest summary of what the current dial is doing. */
export function dialNarrative(summary: EquitySummary): string {
  const pct = Math.round(summary.lambda * 100);
  if (summary.lambda === 0) {
    return "Efficiency dial at 0% — pure need ordering, no logistics weighting.";
  }
  const added =
    summary.addedMedianDaysRemote > 0.05
      ? `adds +${summary.addedMedianDaysRemote.toFixed(0)} median days for remote households`
      : "has no material delay for remote households";
  return `Efficiency dial at ${pct}% — saves ${formatAud(summary.travelSavedByBatching)} of travel across the queue and ${added}.`;
}
