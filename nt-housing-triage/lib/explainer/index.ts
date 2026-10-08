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
  ageSentence: string | null;
  facts: string[];
}

export function whyCard(
  r: RankedJob,
  noBatchById?: Record<string, RankedJob>,
): WhyCard {
  const needSentence = `${SAFETY_LABEL[r.job.report.safety_level]} safety - ${r.need.drivers
    .slice(0, 3)
    .join(", ")}.`;

  let gapSentence: string | null = null;
  if (r.equityGap > 0) {
    gapSentence = `#${r.needRank} on need, #${r.efficiencyRank} after logistics - logistics pushed it down ${r.equityGap} place${r.equityGap === 1 ? "" : "s"}.`;
  } else if (r.equityGap < 0) {
    gapSentence = `#${r.needRank} on need, #${r.efficiencyRank} after logistics - logistics favours this job.`;
  } else {
    gapSentence = `#${r.needRank} on need and #${r.efficiencyRank} on logistics - no equity gap.`;
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
        ? `Batched as "${r.batch.label}" - recovers ${recovery} place${recovery === 1 ? "" : "s"}, ${saved}.`
        : `Batched as "${r.batch.label}" - ${saved}.`;
  }

  let ageSentence: string | null = null;
  if (r.need.agePoints > 0) {
    ageSentence = `Waiting ${plural(Math.round(r.need.ageDays), "day")} has added ${Math.round(
      r.need.agePoints,
    )} need points, so newer reports cannot push it down indefinitely.`;
  }

  return {
    headline: `${CATEGORY_LABEL[r.job.report.category]} · ${r.job.community.name} · queue #${r.finalRank}`,
    needSentence,
    gapSentence,
    batchSentence,
    ageSentence,
    facts: r.efficiency.drivers,
  };
}

export interface TenantAnswer {
  headline: string;
  body: string[];
  /** What the tenant can tell us that would move the repair up. */
  whatWouldChange: string;
  escalation: string;
}

/** The human decision behind the current queue order, shown to the tenant. */
export interface PolicyDecision {
  lambda: number;
  /** Who committed the schedule, e.g. "the maintenance coordinator". */
  decidedBy: string;
  /** ISO timestamp of the commit. */
  decidedAt: string;
  /** The reason the decider recorded for weighting travel cost, if any. */
  reason?: string | null;
}

/**
 * Response targets. These are the NT Government's standard-area timeframes
 * (Repairs and maintenance fact sheet FS17, 2025): urgent within 2 business
 * days and routine within 10. The policy allows remote areas 5 and 25 days.
 * We apply the standard-area times to every tenant, wherever they live, so a
 * remote job that runs late is reported as late rather than hidden by a
 * longer remote target.
 */
const RESPONSE_TARGET: Record<string, string> = {
  critical: "within 1 working day",
  high: "within 2 business days",
  medium: "within 10 business days",
  low: "within 10 business days",
};

/** The same targets in working days, to compare against the estimated start. */
export const TARGET_WORKING_DAYS: Record<string, number> = {
  critical: 1,
  high: 2,
  medium: 10,
  low: 10,
};

/** Why a job sits ahead of another in the queue, in the tenant's terms. */
export type AheadReason = "more_urgent" | "waiting_longer" | "cheaper_to_reach";

/**
 * Every job ahead of `r`, with the reason it is ahead. The tenant's written
 * answer and the tenant's street drawing both use this, so they always agree.
 * Safety is compared without ageing, so a job that is ahead because it has
 * waited longer is not wrongly described as "more urgent for safety".
 */
export function aheadOf(r: RankedJob, ranked: RankedJob[]): { job: RankedJob; reason: AheadReason }[] {
  const safetyNeed = (o: RankedJob) => o.need.score - o.need.agePoints;
  const mine = safetyNeed(r);
  return ranked
    .filter((o) => o.finalRank < r.finalRank)
    .sort((a, b) => a.finalRank - b.finalRank)
    .map((o) => ({
      job: o,
      reason: safetyNeed(o) > mine ? "more_urgent" : o.need.score > r.need.score ? "waiting_longer" : "cheaper_to_reach",
    }));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
  options: {
    today?: Date;
    lambda?: number;
    total?: number;
    /** The full ranked queue, so the answer can say what sits ahead and why. */
    ranked?: RankedJob[];
    /** The committed human decision; omitted when nothing is committed yet. */
    decision?: PolicyDecision | null;
  } = {},
): TenantAnswer {
  const today = options.today ?? new Date();
  const total = options.total ?? options.ranked?.length;
  const safety = r.job.report.safety_level;

  const headline = `Your repair is #${r.finalRank}${total ? ` of ${total}` : ""} in the queue`;

  // 1. What we understood. Only name the community if the summary doesn't already.
  const summary = r.job.report.summary.replace(/[.\s]+$/, "");
  const mentionsCommunity = summary.toLowerCase().includes(r.job.community.name.toLowerCase());
  const body: string[] = [
    `What we understood: ${summary}${mentionsCommunity ? "" : ` (${r.job.community.name})`}.`,
    // 2. How urgent we assessed it, as a plain response target.
    `We rated it ${SAFETY_LABEL[safety].toLowerCase()} for safety. Our target for ${SAFETY_LABEL[
      safety
    ].toLowerCase()} repairs is a visit ${RESPONSE_TARGET[safety]}, the same target as in Darwin.`,
  ];

  // 2b. Fail-safe hold: say plainly that the system could not read the report.
  if (r.need.heldForReading) {
    body.push(
      "Our system could not tell what the hazard is from your report, so it is being held at high priority until a person reads it.",
    );
  }

  // 3. What is ahead of it, in concrete terms the tenant can check.
  if (options.ranked && r.finalRank > 1) {
    const ahead = aheadOf(r, options.ranked);
    const moreUrgent = ahead.filter((a) => a.reason === "more_urgent").length;
    const aged = ahead.filter((a) => a.reason === "waiting_longer").length;
    const lessUrgent = ahead.length - moreUrgent - aged;
    let line = `${plural(ahead.length, "repair")} ${ahead.length === 1 ? "is" : "are"} ahead of yours. ${
      moreUrgent
    } of them ${moreUrgent === 1 ? "was" : "were"} rated more urgent for safety than yours.`;
    if (aged > 0) {
      line += ` ${aged} ${aged === 1 ? "is" : "are"} ahead because ${
        aged === 1 ? "it has" : "they have"
      } been waiting longer.`;
    }
    if (lessUrgent > 0) {
      line += ` ${lessUrgent} ${lessUrgent === 1 ? "is" : "are"} ahead mainly because ${
        lessUrgent === 1 ? "it is" : "they are"
      } cheaper or quicker to reach.`;
    }
    body.push(line);
  }

  // 3b. Waiting time is a lever the tenant cannot pull, so say it plainly when
  // it is helping them, not just when the dial hurts them.
  if (r.need.agePoints > 0) {
    body.push(
      `This repair has been waiting ${plural(Math.round(r.need.ageDays), "day")}, which raises its priority so newer reports cannot jump ahead of it.`,
    );
  }

  // 4. Who moved it, and when. A person owns the trade-off, never "the system".
  const decision = options.decision ?? null;
  const who = decision?.decidedBy ?? "the maintenance coordinator";
  const when = decision
    ? ` on ${new Date(decision.decidedAt).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`
    : "";
  if (r.movedByDial > 0) {
    body.push(
      `It is ${plural(r.movedByDial, "place")} lower than safety alone would put it. That is because ${who} decided${when} to give travel cost some weight in this schedule. That decision is recorded and can be reviewed.` +
        // The decider's own words, so the tenant gets the actual reason, not a summary of it.
        (decision?.reason ? ` The reason recorded was: "${decision.reason.replace(/[.\s]+$/, "")}".` : ""),
    );
  } else if (r.movedByDial < 0) {
    body.push(
      `It is ${plural(Math.abs(r.movedByDial), "place")} higher than safety alone would put it, because it is cheaper to reach and ${who} decided${when} to give travel cost some weight in this schedule.`,
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

  // Say plainly when we expect to miss our own target. Hiding a breach is the
  // quiet kind of deprioritisation this tool exists to surface.
  if (Math.ceil(r.estimatedStartDays) > TARGET_WORKING_DAYS[safety]) {
    body.push(
      "That is later than our target. There are not enough trades to meet every target right now, and this has been flagged to the coordinator.",
    );
  }

  // 5. The lever: explanation without something the tenant can do is just a refusal.
  const whatWouldChange =
    "Tell us if anyone in the house is a baby or young child, an older person, has a disability, or relies on medical equipment, or if the problem gets worse. Any of these can move your repair up.";

  return {
    headline,
    body,
    whatWouldChange,
    escalation:
      "If you think this is wrong, ask for a review below or call the housing maintenance line with your job number. A person will look at it. The computer does not make the final decision.",
  };
}

/** One-line honest summary of what the current dial is doing. */
export function dialNarrative(summary: EquitySummary): string {
  const pct = Math.round(summary.lambda * 100);
  if (summary.lambda === 0) {
    return "Efficiency dial at 0% - pure need ordering, no logistics weighting.";
  }
  const added =
    summary.addedMedianDaysRemote > 0.05
      ? `adds +${summary.addedMedianDaysRemote.toFixed(0)} median days for remote households`
      : "has no material delay for remote households";
  // Batching saves the same travel at every dial setting, and every job still
  // gets done, so the dial itself saves no travel: it changes who goes first.
  return `Efficiency dial at ${pct}%: ${added}. The dial does not reduce total travel; batching saves ${formatAud(summary.travelSavedByBatching)} at every setting.`;
}
