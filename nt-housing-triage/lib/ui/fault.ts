/**
 * What kind of repair a report is, and which parts of a house it touches.
 *
 * Used only for drawing (icons, the house diagram). It reads the parsed report
 * and never feeds back into scoring or ranking.
 */
import { CATEGORY_LABEL, type Category, type ParsedReport, type UrgencyFlag } from "@/lib/taxonomy";

type ReportShape = Pick<ParsedReport, "category" | "urgency_flags">;

/** A category, plus "pest" for pest reports that the taxonomy files under "other". */
export type FaultKind = Category | "pest";

export function faultKind(report: ReportShape): FaultKind {
  if (report.category === "other" && report.urgency_flags.includes("vermin_pest")) return "pest";
  return report.category;
}

/** The taxonomy's own category names, so icons and headings never disagree. */
export const FAULT_LABEL: Record<FaultKind, string> = { ...CATEGORY_LABEL, pest: "Pests" };

/** The parts of the house the diagram can light up. */
export type HouseZone =
  | "roof"
  | "wiring"
  | "tap"
  | "tank"
  | "toilet"
  | "sewer"
  | "door"
  | "window"
  | "aircon"
  | "kitchen"
  | "shower"
  | "ramp"
  | "pest"
  | "medical";

export const ZONE_LABEL: Record<HouseZone, string> = {
  roof: "Roof and ceiling",
  wiring: "Wiring and power",
  tap: "Taps and pipes",
  tank: "Water supply",
  toilet: "Toilet",
  sewer: "Sewage",
  door: "Door and lock",
  window: "Window",
  aircon: "Air conditioner",
  kitchen: "Stove and fridge",
  shower: "Shower and hot water",
  ramp: "Ramp and access",
  pest: "Pests",
  medical: "Medical equipment",
};

const CATEGORY_ZONES: Record<Category, HouseZone[]> = {
  plumbing: ["tap"],
  electrical: ["wiring"],
  structural: ["roof"],
  cooling: ["aircon"],
  water_quality: ["tank", "tap"],
  sanitation: ["toilet"],
  security: ["door"],
  kitchen: ["kitchen"],
  bathroom: ["shower"],
  medical: ["medical"],
  accessibility: ["ramp"],
  other: [],
};

const FLAG_ZONES: Partial<Record<UrgencyFlag, HouseZone[]>> = {
  exposed_wiring: ["wiring"],
  fire_risk: ["wiring"],
  structural: ["roof"],
  no_water: ["tap", "tank"],
  no_hot_water: ["shower"],
  sewage: ["sewer"],
  water_contamination: ["tank", "tap"],
  no_cooling_extreme_heat: ["aircon"],
  security: ["door", "window"],
  only_toilet_blocked: ["toilet"],
  medical_equipment: ["medical"],
  accessibility: ["ramp"],
  vermin_pest: ["pest"],
};

/** Parts of the house this report touches: its category first, then anything its hazards add. */
export function houseZones(report: ReportShape): HouseZone[] {
  const zones: HouseZone[] = [...CATEGORY_ZONES[report.category]];
  for (const flag of report.urgency_flags) {
    for (const zone of FLAG_ZONES[flag] ?? []) {
      if (!zones.includes(zone)) zones.push(zone);
    }
  }
  return zones;
}
