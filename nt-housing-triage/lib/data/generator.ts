import {
  VULNERABILITY_TRIGGERS,
  type Category,
  type ParsedReport,
  type SafetyLevel,
  type Trade,
  type UrgencyFlag,
  type Vulnerability,
} from "@/lib/taxonomy";
import { COMMUNITIES, type Community } from "./communities";
import { Rng } from "./rng";
import { escalateSafety } from "@/lib/engine/scoring";

/**
 * Synthetic report generator.
 *
 * One generator, three uses:
 *   1. the demo dataset (seeded, reproducible so the equity scenario stages)
 *   2. the fine-tune training set (report -> JSON label)
 *   3. the held-out eval split
 */

interface Scenario {
  category: Category;
  baseSafety: SafetyLevel;
  flags: UrgencyFlag[];
  vulnerability: Vulnerability[];
  trade: Trade;
  fragments: string[];
  extras?: string[];
}

const SCENARIOS: Scenario[] = [
  // plumbing
  {
    category: "plumbing",
    baseSafety: "high",
    flags: ["no_water"],
    vulnerability: ["infants", "elderly"],
    trade: "plumber",
    fragments: ["no water at all for two days", "nothing coming out of any tap", "water cut off since yesterday"],
    extras: ["its 42 degrees", "got a baby and my nan here", "kids cant have a wash"],
  },
  {
    category: "plumbing",
    baseSafety: "medium",
    flags: [],
    vulnerability: [],
    trade: "plumber",
    fragments: ["tap leaking under the sink for weeks", "dripping tap in the kitchen", "water pressure gone in the shower"],
  },
  {
    category: "plumbing",
    baseSafety: "medium",
    flags: ["no_hot_water"],
    vulnerability: [],
    trade: "plumber",
    fragments: ["no hot water since tuesday", "only cold showers for a week", "hot water system stopped"],
  },
  {
    category: "plumbing",
    baseSafety: "high",
    flags: ["sewage"],
    vulnerability: [],
    trade: "plumber",
    fragments: ["sewage overflowing outside the back door", "sewerage backing up in the yard", "smells like poo near the bathroom"],
  },
  // electrical
  {
    category: "electrical",
    baseSafety: "critical",
    flags: ["exposed_wiring", "fire_risk"],
    vulnerability: [],
    trade: "electrician",
    fragments: ["sparks coming out of the powerpoint", "wire hanging out of the wall", "burning smell from the switchboard"],
  },
  {
    category: "electrical",
    baseSafety: "critical",
    flags: ["exposed_wiring", "medical_equipment"],
    vulnerability: ["medical_dependent"],
    trade: "electrician",
    fragments: ["sparks from the powerpoint near the oxygen machine", "power point scorched where the dialysis machine plugs in"],
  },
  {
    category: "electrical",
    baseSafety: "medium",
    flags: [],
    vulnerability: [],
    trade: "electrician",
    fragments: ["lights flicker and trip the box", "no power in the back rooms", "powerpoint dead in the lounge"],
  },
  // structural
  {
    category: "structural",
    baseSafety: "critical",
    flags: ["structural", "child_safety"],
    vulnerability: ["infants"],
    trade: "carpenter",
    fragments: ["roof is leaking right over my kids bed and the ceiling is sagging", "ceiling caving in above the children", "roof caving over the bedroom"],
    extras: ["storm did it", "worried it will come down"],
  },
  {
    category: "structural",
    baseSafety: "high",
    flags: ["structural"],
    vulnerability: [],
    trade: "carpenter",
    fragments: ["wall cracked right through after the cyclone", "floor gave way near the door", "verandah posts collapsing"],
  },
  // cooling
  {
    category: "cooling",
    baseSafety: "high",
    flags: ["no_cooling_extreme_heat"],
    vulnerability: ["infants", "elderly"],
    trade: "hvac",
    fragments: ["aircon dead and its 40 degrees", "no aircon and the kids cant sleep", "split system died in the heat"],
  },
  {
    category: "cooling",
    baseSafety: "medium",
    flags: [],
    vulnerability: [],
    trade: "hvac",
    fragments: ["fan broke in the bedroom", "split system leaking water", "aircon not cooling properly"],
  },
  // water quality
  {
    category: "water_quality",
    baseSafety: "high",
    flags: ["water_contamination", "child_safety"],
    vulnerability: ["infants"],
    trade: "plumber",
    fragments: ["water from the tap is brown and smells", "tank water is dirty and cant drink it", "bore water salty and smells off"],
  },
  // sanitation
  {
    category: "sanitation",
    baseSafety: "high",
    flags: ["only_toilet_blocked", "sewage"],
    vulnerability: [],
    trade: "plumber",
    fragments: ["toilet blocked and its the only one in the house", "only toilet backing up", "one toilet blocked and overflowing"],
  },
  // security
  {
    category: "security",
    baseSafety: "high",
    flags: ["security"],
    vulnerability: [],
    trade: "carpenter",
    fragments: ["back door wont lock and the window got smashed", "cant lock the house at night", "front gate broken and lock hanging off"],
  },
  {
    category: "security",
    baseSafety: "high",
    flags: ["security", "child_safety"],
    vulnerability: ["infants"],
    trade: "carpenter",
    fragments: ["door wont lock and there was a break in, kids scared", "windows smashed and cant secure the house with the baby"],
  },
  // kitchen
  {
    category: "kitchen",
    baseSafety: "medium",
    flags: [],
    vulnerability: [],
    trade: "handyperson",
    fragments: ["stove stopped working and fridge died last week", "oven sparking and fridge not cold", "stove not working"],
  },
  // bathroom
  {
    category: "bathroom",
    baseSafety: "low",
    flags: [],
    vulnerability: [],
    trade: "handyperson",
    fragments: ["shower head dripping and a tile cracked", "bath leaking through the floor slowly", "shower no water pressure"],
  },
  // medical
  {
    category: "medical",
    baseSafety: "critical",
    flags: ["medical_equipment"],
    vulnerability: ["medical_dependent"],
    trade: "electrician",
    fragments: ["oxygen machine has no power", "dialysis needs a reliable socket", "cpap machine wont run, power point dead"],
  },
  // accessibility
  {
    category: "accessibility",
    baseSafety: "critical",
    flags: ["accessibility"],
    vulnerability: ["disability"],
    trade: "carpenter",
    fragments: ["wheelchair ramp fell apart and cant get in the house", "grab rail fell off the wall in the bathroom", "cant get the chair through the door"],
  },
  // other / vermin
  {
    category: "other",
    baseSafety: "medium",
    flags: ["vermin_pest"],
    vulnerability: [],
    trade: "handyperson",
    fragments: ["ants everywhere in the kitchen", "rats in the roof at night", "termites in the back wall"],
  },
  {
    category: "other",
    baseSafety: "high",
    flags: ["vermin_pest", "child_safety"],
    vulnerability: ["infants"],
    trade: "handyperson",
    fragments: ["snake in the yard near the kids", "snake came into the laundry"],
  },
  {
    category: "other",
    baseSafety: "low",
    flags: [],
    vulnerability: [],
    trade: "handyperson",
    fragments: ["mosquito screens torn", "general wear and tear", "loose hinge on the cupboard"],
  },
];

function withCommunity(text: string, community: Community, rng: Rng): string {
  const forms = [
    `in ${community.name}`,
    `at ${community.name}`,
    `${community.name} house`,
    `, ${community.name}`,
  ];
  return `${text} ${rng.pick(forms)}`.replace(/\s+,/g, ",");
}

function vulnerabilityClause(vulnerability: Vulnerability[], rng: Rng): string {
  if (vulnerability.length === 0) return "";
  const value = rng.pick(vulnerability);
  const phrase = rng.pick(VULNERABILITY_TRIGGERS[value]);
  return `, got ${phrase} here`;
}

export interface GeneratedReport {
  rawText: string;
  label: ParsedReport;
  communityId: string;
  tier: string;
}

export function generateReport(rng: Rng, communities: readonly Community[] = COMMUNITIES): GeneratedReport {
  const scenario = rng.pick(SCENARIOS);
  const community = rng.pick(communities);

  const vulnerability = [...scenario.vulnerability];
  let flags = [...scenario.flags];
  if (rng.chance(0.25) && vulnerability.includes("infants") && !flags.includes("child_safety")) {
    flags.push("child_safety");
  }
  if (rng.chance(0.2) && vulnerability.includes("elderly") && !flags.includes("elder_safety")) {
    flags.push("elder_safety");
  }

  const fragment = rng.pick(scenario.fragments);
  const extra = scenario.extras && rng.chance(0.5) ? `, ${rng.pick(scenario.extras)}` : "";
  const rawText = withCommunity(`${fragment}${vulnerabilityClause(vulnerability, rng)}${extra}`, community, rng);

  const safety_level = escalateSafety({
    safety_level: scenario.baseSafety,
    urgency_flags: flags,
    occupant_vulnerability: vulnerability,
  });

  const label: ParsedReport = {
    summary: fragment.charAt(0).toUpperCase() + fragment.slice(1),
    category: scenario.category,
    safety_level,
    urgency_flags: flags,
    occupant_vulnerability: vulnerability,
    trade_required: scenario.trade,
    community: community.name,
  };

  return { rawText, label, communityId: community.id, tier: community.tier };
}

export function generateReports(
  count: number,
  seed: string | number = "nt-housing",
  communities: readonly Community[] = COMMUNITIES,
): GeneratedReport[] {
  const rng = new Rng(seed);
  return Array.from({ length: count }, () => generateReport(rng, communities));
}

export { SCENARIOS };
