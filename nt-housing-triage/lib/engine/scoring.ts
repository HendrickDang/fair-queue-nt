import {
  FLAG_LABEL,
  FLAG_WEIGHT,
  SAFETY_BASE,
  SAFETY_LABEL,
  SAFETY_RESPONSE_WINDOW_HOURS,
  VULNERABILITY_LABEL,
  VULNERABILITY_WEIGHT,
  type SafetyLevel,
} from "@/lib/taxonomy";
import { baseForCommunity, getCommunity } from "@/lib/data/communities";
import type { Job, JobInput, NeedScore } from "./types";

const SAFETY_ORDER: SafetyLevel[] = ["low", "medium", "high", "critical"];

function bump(current: SafetyLevel, to: SafetyLevel): SafetyLevel {
  return SAFETY_ORDER.indexOf(to) > SAFETY_ORDER.indexOf(current) ? to : current;
}

/**
 * Cross-field escalation rules (taxonomy §8). The generator and the engine share
 * these so a generated label and the engine's view of safety never disagree.
 */
export function escalateSafety(report: {
  safety_level: SafetyLevel;
  urgency_flags: string[];
  occupant_vulnerability: string[];
}): SafetyLevel {
  const flags = new Set(report.urgency_flags);
  const vuln = new Set(report.occupant_vulnerability);
  const vulnerable = vuln.has("infants") || vuln.has("elderly") || vuln.has("medical_dependent");
  let level = report.safety_level;

  // 2. structural failure and exposed wiring are critical regardless of
  // vulnerability. Raw sewage is critical too, but a *contained* blocked toilet
  // ("only toilet blocked, backing up") stays high — see taxonomy §9 example 6.
  if (flags.has("structural") || flags.has("exposed_wiring")) {
    level = bump(level, "critical");
  }
  if (flags.has("sewage") && !flags.has("only_toilet_blocked")) {
    level = bump(level, "critical");
  }
  // 3. medical equipment power issue
  if (flags.has("medical_equipment")) {
    level = bump(level, "critical");
  }
  // 1. no water + vulnerable + (heat implied by the flag) -> critical
  if (flags.has("no_water") && vulnerable) {
    level = bump(level, "critical");
  }
  // 4. no cooling in extreme heat with vulnerable occupants
  if (flags.has("no_cooling_extreme_heat") && (vuln.has("infants") || vuln.has("elderly"))) {
    level = bump(level, "high");
  }
  // 5. security + child safety
  if (flags.has("security") && flags.has("child_safety")) {
    level = bump(level, "critical");
  }
  // 6/7. only toilet blocked and water contamination are at least high
  if (flags.has("only_toilet_blocked") || flags.has("water_contamination")) {
    level = bump(level, "high");
  }
  // 8. snake + child safety
  if (flags.has("vermin_pest") && flags.has("child_safety")) {
    level = bump(level, "high");
  }
  // accessibility failure trapping a person with a disability at home
  if (flags.has("accessibility") && vuln.has("disability")) {
    level = bump(level, "critical");
  }

  return level;
}

/** Location-blind, human-centric need score. Higher = more urgent. */
export function scoreNeed(job: JobInput): NeedScore {
  const report = job.report;
  const safetyLevel = escalateSafety(report);
  const safetyScore = SAFETY_BASE[safetyLevel];

  let flagScore = 0;
  const drivers: string[] = [`${SAFETY_LABEL[safetyLevel]} safety level`];
  for (const flag of report.urgency_flags) {
    const weight = FLAG_WEIGHT[flag] ?? 0;
    flagScore += weight;
    drivers.push(FLAG_LABEL[flag] ?? flag);
  }

  let vulnBonus = 0;
  for (const v of report.occupant_vulnerability) {
    vulnBonus += VULNERABILITY_WEIGHT[v] ?? 0;
    drivers.push(`${VULNERABILITY_LABEL[v]} in household`);
  }
  const vulnerabilityMultiplier = Math.min(2, 1 + vulnBonus);

  const score = (safetyScore + flagScore) * vulnerabilityMultiplier;

  return { score, safetyScore, flagScore, vulnerabilityMultiplier, drivers };
}

export interface BuildJobResult {
  job: Job | null;
  error?: string;
}

/**
 * Resolve a parsed report against the community dataset. Returns an error rather
 * than throwing so the API can surface an unknown community gracefully.
 */
export function buildJob(input: JobInput): BuildJobResult {
  const community = getCommunity(input.report.community);
  if (!community) {
    return { job: null, error: `Unknown community: ${input.report.community}` };
  }
  return {
    job: {
      ...input,
      community,
      base: baseForCommunity(community),
    },
  };
}

export function responseWindowHours(report: { safety_level: SafetyLevel }): number {
  return SAFETY_RESPONSE_WINDOW_HOURS[report.safety_level];
}
