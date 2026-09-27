/**
 * Shared taxonomy for NT remote housing maintenance triage.
 *
 * This module is the single source of truth for the enums, trigger phrases and
 * scoring weights used by three consumers:
 *   - the synthetic report generator  (samples from it)
 *   - the deterministic fallback parser (keyword / trigger phrases)
 *   - the fine-tune labels + ranking engine (the JSON schema and weights)
 *
 * Mirrors `.opencode/plan/nt-housing-triage-taxonomy.md`.
 */

export const CATEGORIES = [
  "plumbing",
  "electrical",
  "structural",
  "cooling",
  "water_quality",
  "sanitation",
  "security",
  "kitchen",
  "bathroom",
  "medical",
  "accessibility",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SAFETY_LEVELS = ["critical", "high", "medium", "low"] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export const URGENCY_FLAGS = [
  "exposed_wiring",
  "fire_risk",
  "structural",
  "no_water",
  "no_hot_water",
  "sewage",
  "water_contamination",
  "no_cooling_extreme_heat",
  "security",
  "only_toilet_blocked",
  "medical_equipment",
  "child_safety",
  "elder_safety",
  "accessibility",
  "vermin_pest",
] as const;
export type UrgencyFlag = (typeof URGENCY_FLAGS)[number];

export const VULNERABILITIES = [
  "infants",
  "elderly",
  "disability",
  "medical_dependent",
  "overcrowded",
] as const;
export type Vulnerability = (typeof VULNERABILITIES)[number];

export const TRADES = [
  "plumber",
  "electrician",
  "carpenter",
  "hvac",
  "handyperson",
  "multi",
] as const;
export type Trade = (typeof TRADES)[number];

export const TIERS = ["T0", "T1", "T2", "T3"] as const;
export type Tier = (typeof TIERS)[number];

export const ARIA_CLASSES = [
  "highly_accessible",
  "accessible",
  "moderately_accessible",
  "remote",
  "very_remote",
] as const;
export type AriaClass = (typeof ARIA_CLASSES)[number];

export const ACCESS_MODES = ["road", "air", "barge"] as const;
export type AccessMode = (typeof ACCESS_MODES)[number];

/** The structured output the parser returns and the generator emits as a label. */
export interface ParsedReport {
  summary: string;
  category: Category;
  safety_level: SafetyLevel;
  urgency_flags: UrgencyFlag[];
  occupant_vulnerability: Vulnerability[];
  trade_required: Trade;
  community: string;
}

/* -------------------------------------------------------------------------- */
/* Trigger phrases — generator vocabulary + fallback regex                     */
/* -------------------------------------------------------------------------- */

export const FLAG_TRIGGERS: Record<UrgencyFlag, string[]> = {
  exposed_wiring: ["sparks", "wire hanging", "bare wire", "live wire", "shocks me", "burning smell"],
  fire_risk: ["smoke", "sparks and smells", "burning", "scorched"],
  structural: [
    "ceiling falling",
    "ceiling is sagging",
    "sagging",
    "roof caving",
    "caving",
    "roof leaking",
    "collapsing",
    "coming down",
    "wall cracked",
    "floor gave way",
    "cyclone damage",
  ],
  no_water: ["no water", "water cut off", "nothing coming out", "no running water"],
  no_hot_water: ["no hot water", "cold showers"],
  sewage: ["sewage", "sewerage", "backing up", "overflow", "smells like poo", "smells like waste"],
  water_contamination: ["brown water", "dirty water", "can't drink", "smells", "salty bore"],
  no_cooling_extreme_heat: [
    "aircon dead",
    "no aircon",
    "so hot",
    "40 degrees",
    "42 degrees",
    "kids can't sleep",
  ],
  security: [
    "won't lock",
    "wont lock",
    "smashed window",
    "smashed",
    "can't secure",
    "broken lock",
    "break in",
  ],
  only_toilet_blocked: ["only toilet", "one toilet", "toilet blocked"],
  medical_equipment: ["oxygen", "dialysis", "cpap", "ventilator", "medical"],
  child_safety: ["kids", "baby", "children", "toddler"],
  elder_safety: ["elderly", "old man", "old lady", "nan", "grandmother", "grandfather"],
  accessibility: ["wheelchair", "ramp", "grab rail", "can't get in"],
  vermin_pest: ["ants", "rats", "mice", "mosquito", "termites", "snake"],
};

export const VULNERABILITY_TRIGGERS: Record<Vulnerability, string[]> = {
  infants: ["baby", "newborn", "kids", "children", "toddler", "little ones"],
  elderly: ["elderly", "old", "nan", "pop", "grandmother", "grandfather", "80 years"],
  disability: ["wheelchair", "can't walk", "disabled", "mobility", "carer"],
  medical_dependent: ["oxygen", "dialysis", "cpap", "ventilator", "chronic illness"],
  overcrowded: ["three families", "12 people", "everyone in one house", "crowded"],
};

/** Category hints for the fallback classifier (never authoritative on its own). */
export const CATEGORY_TRIGGERS: Record<Category, string[]> = {
  plumbing: ["tap", "pipe", "hot water", "water pressure", "leak", "plumbing"],
  electrical: ["powerpoint", "power point", "power", "lights", "wiring", "wire", "electrical", "trip"],
  structural: ["roof", "ceiling", "floor", "verandah", "wall", "structural", "cyclone"],
  cooling: ["aircon", "air con", "fan", "split system", "cooling", "air conditioner"],
  water_quality: ["brown water", "tank water", "bore water", "clean water", "drinking water"],
  sanitation: ["toilet", "sewage", "sewerage", "sewer", "backing up"],
  security: ["door", "window", "lock", "gate", "secure", "break in"],
  kitchen: ["stove", "fridge", "oven", "kitchen"],
  bathroom: ["shower", "bath", "bathroom", "vanity"],
  medical: ["oxygen", "dialysis", "medical", "cpap"],
  accessibility: ["wheelchair", "ramp", "grab rail", "access", "mobility"],
  other: ["ants", "rats", "mosquito", "screens", "wear and tear", "pest", "vermin"],
};

/* -------------------------------------------------------------------------- */
/* Scoring weights                                                            */
/* -------------------------------------------------------------------------- */

export const SAFETY_BASE: Record<SafetyLevel, number> = {
  critical: 100,
  high: 60,
  medium: 25,
  low: 8,
};

export const FLAG_WEIGHT: Record<UrgencyFlag, number> = {
  exposed_wiring: 30,
  fire_risk: 25,
  structural: 30,
  no_water: 22,
  no_hot_water: 8,
  sewage: 25,
  water_contamination: 15,
  no_cooling_extreme_heat: 18,
  security: 14,
  only_toilet_blocked: 12,
  medical_equipment: 28,
  child_safety: 12,
  elder_safety: 10,
  accessibility: 12,
  vermin_pest: 4,
};

export const VULNERABILITY_WEIGHT: Record<Vulnerability, number> = {
  infants: 0.2,
  elderly: 0.18,
  disability: 0.18,
  medical_dependent: 0.3,
  overcrowded: 0.12,
};

/** Default trade a category dispatches, before cross-trade escalation. */
export const CATEGORY_TRADE: Record<Category, Trade> = {
  plumbing: "plumber",
  electrical: "electrician",
  structural: "carpenter",
  cooling: "hvac",
  water_quality: "plumber",
  sanitation: "plumber",
  security: "carpenter",
  kitchen: "handyperson",
  bathroom: "plumber",
  medical: "electrician",
  accessibility: "carpenter",
  other: "handyperson",
};

/** Typical on-site job duration in hours (used by the efficiency model). */
export const CATEGORY_DURATION_HOURS: Record<Category, number> = {
  plumbing: 2.5,
  electrical: 2,
  structural: 6,
  cooling: 3,
  water_quality: 3,
  sanitation: 3,
  security: 3,
  kitchen: 2,
  bathroom: 2.5,
  medical: 2,
  accessibility: 3,
  other: 1.5,
};

export const SAFETY_RESPONSE_WINDOW_HOURS: Record<SafetyLevel, number> = {
  critical: 24,
  high: 72,
  medium: 24 * 7 * 2,
  low: 24 * 7 * 6,
};

/* -------------------------------------------------------------------------- */
/* Human-readable labels                                                      */
/* -------------------------------------------------------------------------- */

export const CATEGORY_LABEL: Record<Category, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  structural: "Structural",
  cooling: "Cooling",
  water_quality: "Water quality",
  sanitation: "Sanitation",
  security: "Security",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  medical: "Medical",
  accessibility: "Accessibility",
  other: "Other",
};

export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const FLAG_LABEL: Record<UrgencyFlag, string> = {
  exposed_wiring: "Exposed wiring",
  fire_risk: "Fire risk",
  structural: "Structural failure",
  no_water: "No water",
  no_hot_water: "No hot water",
  sewage: "Sewage",
  water_contamination: "Water contamination",
  no_cooling_extreme_heat: "No cooling in extreme heat",
  security: "Security",
  only_toilet_blocked: "Only toilet blocked",
  medical_equipment: "Medical equipment power",
  child_safety: "Child safety",
  elder_safety: "Elder safety",
  accessibility: "Accessibility",
  vermin_pest: "Vermin / pest",
};

export const VULNERABILITY_LABEL: Record<Vulnerability, string> = {
  infants: "Infants",
  elderly: "Elderly",
  disability: "Disability",
  medical_dependent: "Medical dependent",
  overcrowded: "Overcrowded",
};

export const TRADE_LABEL: Record<Trade, string> = {
  plumber: "Plumber",
  electrician: "Electrician",
  carpenter: "Carpenter",
  hvac: "HVAC technician",
  handyperson: "Handyperson",
  multi: "Multi-trade team",
};
