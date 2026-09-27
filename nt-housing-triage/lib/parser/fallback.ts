import {
  CATEGORY_LABEL,
  CATEGORY_TRADE,
  CATEGORY_TRIGGERS,
  FLAG_TRIGGERS,
  VULNERABILITY_TRIGGERS,
  type Category,
  type ParsedReport,
  type SafetyLevel,
  type Trade,
  type UrgencyFlag,
  type Vulnerability,
} from "@/lib/taxonomy";
import { matchCommunity } from "@/lib/data/communities";
import { escalateSafety } from "@/lib/engine/scoring";
import type { ParseResult } from "./types";

/** Deterministic, offline parser. Mirrors the fine-tuned model's output schema. */

function containsAny(haystack: string, phrases: string[]): boolean {
  return phrases.some((p) => haystack.includes(p));
}

const HEAT_RE = /(3[89]|4\d)\s*(degrees|deg\b|°|c\b)/i;

/** Refined phrase sets — the taxonomy tables stay the shared vocabulary, but a
 * few bare words ("smells") are too ambiguous to fire on their own here. */
const WATER_CONTAMINATION_RE = /\b(brown|dirty|muddy|salty|smells?\s+(off|bad|funny)|can'?t drink|cant drink)\b/i;

const DERIVED_FLAGS: UrgencyFlag[] = ["child_safety", "elder_safety"];

export function detectFlags(text: string): UrgencyFlag[] {
  const found: UrgencyFlag[] = [];
  for (const flag of Object.keys(FLAG_TRIGGERS) as UrgencyFlag[]) {
    if (DERIVED_FLAGS.includes(flag)) continue;
    if (flag === "water_contamination") {
      if (WATER_CONTAMINATION_RE.test(text)) found.push(flag);
      continue;
    }
    if (flag === "no_cooling_extreme_heat") {
      const coolingWord = /aircon|air con|air conditioner|split system|cooling/.test(text);
      const hot = HEAT_RE.test(text) || /so hot|can'?t sleep|too hot/.test(text);
      if (coolingWord && (hot || /dead|broke|not work|no /.test(text))) found.push(flag);
      continue;
    }
    if (containsAny(text, FLAG_TRIGGERS[flag])) found.push(flag);
  }

  // An exposed live conductor that is arcing/scorching is also a fire risk.
  if (
    found.includes("exposed_wiring") &&
    /\b(sparks?|sparking|burning|smoke|scorched)\b/.test(text) &&
    !found.includes("fire_risk")
  ) {
    found.push("fire_risk");
  }

  return found;
}

export function detectVulnerability(text: string): Vulnerability[] {
  const found: Vulnerability[] = [];
  for (const v of Object.keys(VULNERABILITY_TRIGGERS) as Vulnerability[]) {
    if (containsAny(text, VULNERABILITY_TRIGGERS[v])) found.push(v);
  }
  return found;
}

const FLAG_TO_CATEGORY: Partial<Record<UrgencyFlag, Category>> = {
  exposed_wiring: "electrical",
  fire_risk: "electrical",
  sewage: "sanitation",
  only_toilet_blocked: "sanitation",
  no_water: "plumbing",
  no_hot_water: "plumbing",
  structural: "structural",
  no_cooling_extreme_heat: "cooling",
  water_contamination: "water_quality",
  security: "security",
  medical_equipment: "medical",
  accessibility: "accessibility",
  vermin_pest: "other",
};

export function detectCategory(text: string, flags: UrgencyFlag[]): Category {
  const scores = new Map<Category, number>();
  const add = (c: Category, n: number) => scores.set(c, (scores.get(c) ?? 0) + n);

  for (const c of Object.keys(CATEGORY_TRIGGERS) as Category[]) {
    const hits = CATEGORY_TRIGGERS[c].filter((t) => text.includes(t)).length;
    if (hits > 0) add(c, hits);
  }
  for (const f of flags) {
    const c = FLAG_TO_CATEGORY[f];
    if (c) add(c, 2);
  }

  let best: Category = "other";
  let bestScore = 0;
  for (const [c, score] of scores) {
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

const CRITICAL_FLAGS: UrgencyFlag[] = [
  "exposed_wiring",
  "fire_risk",
  "structural",
  "medical_equipment",
];
const HIGH_FLAGS: UrgencyFlag[] = [
  "no_water",
  "no_cooling_extreme_heat",
  "water_contamination",
  "security",
  "only_toilet_blocked",
];
const MEDIUM_FLAGS: UrgencyFlag[] = ["no_hot_water", "vermin_pest", "accessibility"];

function rubricSafety(flags: UrgencyFlag[], category: Category): SafetyLevel {
  const set = new Set(flags);
  if (CRITICAL_FLAGS.some((f) => set.has(f))) return "critical";
  if (HIGH_FLAGS.some((f) => set.has(f))) return "high";
  if (MEDIUM_FLAGS.some((f) => set.has(f))) return "medium";
  if (
    [
      "plumbing",
      "electrical",
      "structural",
      "cooling",
      "sanitation",
      "security",
      "water_quality",
      "kitchen",
    ].includes(category)
  ) {
    return "medium";
  }
  return "low";
}

function deriveTrade(category: Category, flags: UrgencyFlag[], safety: SafetyLevel): Trade {
  // Cosmetic / routine jobs are handled by a handyperson.
  if (safety === "low") return "handyperson";
  const base = CATEGORY_TRADE[category];
  const electricalFlag = flags.includes("exposed_wiring") || flags.includes("medical_equipment");
  if (electricalFlag && base !== "electrician") return "multi";
  return base;
}

function summarise(text: string, category: Category): string {
  const cleaned = text.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  const sentence = cleaned.length > 100 ? `${cleaned.slice(0, 97)}...` : cleaned;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) || CATEGORY_LABEL[category];
}

export function parseWithFallback(rawText: string): ParseResult {
  const text = rawText.toLowerCase();
  const notes: string[] = [];

  const flags = detectFlags(text);
  const vulnerability = detectVulnerability(text);

  // child/elder safety only count alongside an actual hazard.
  const hasHazard = flags.length > 0;
  if (hasHazard && vulnerability.includes("infants")) flags.push("child_safety");
  if (hasHazard && vulnerability.includes("elderly")) flags.push("elder_safety");

  const category = detectCategory(text, flags);
  const rubric = rubricSafety(flags, category);
  const safety_level = escalateSafety({
    safety_level: rubric,
    urgency_flags: flags,
    occupant_vulnerability: vulnerability,
  });

  const community = matchCommunity(rawText)?.name ?? "";
  if (!community) notes.push("No known NT community detected in the report text.");

  const confidence = Math.min(0.95, 0.35 + flags.length * 0.12 + (community ? 0.2 : 0) + (vulnerability.length ? 0.1 : 0));

  return {
    summary: summarise(rawText, category),
    category,
    safety_level,
    urgency_flags: flags,
    occupant_vulnerability: vulnerability,
    trade_required: deriveTrade(category, flags, safety_level),
    community,
    method: "fallback",
    confidence: Number(confidence.toFixed(2)),
    notes,
  };
}

export function isParsedReport(value: unknown): value is ParsedReport {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.summary === "string" &&
    typeof v.category === "string" &&
    typeof v.safety_level === "string" &&
    Array.isArray(v.urgency_flags) &&
    Array.isArray(v.occupant_vulnerability) &&
    typeof v.trade_required === "string" &&
    typeof v.community === "string"
  );
}
