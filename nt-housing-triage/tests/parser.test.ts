import { describe, expect, it } from "vitest";
import { parseWithFallback } from "@/lib/parser/fallback";
import type { Category, SafetyLevel, Trade } from "@/lib/taxonomy";

/**
 * Golden set from `.opencode/plan/nt-housing-triage-taxonomy.md` §9.
 * The deterministic fallback parser must reproduce these labels exactly.
 */
const GOLDEN: {
  text: string;
  category: Category;
  safety: SafetyLevel;
  flags: string[];
  vulnerability: string[];
  trade: Trade;
}[] = [
  {
    text: "roof is leaking right over my kids bed and the ceiling is sagging, storm did it",
    category: "structural",
    safety: "critical",
    flags: ["structural", "child_safety"],
    vulnerability: ["infants"],
    trade: "carpenter",
  },
  {
    text: "no water at all for two days and its 42 degrees, got a baby and my nan here",
    category: "plumbing",
    safety: "critical",
    flags: ["no_water", "child_safety", "elder_safety"],
    vulnerability: ["infants", "elderly"],
    trade: "plumber",
  },
  {
    text: "sparks coming out of the powerpoint near the oxygen machine",
    category: "electrical",
    safety: "critical",
    flags: ["exposed_wiring", "fire_risk", "medical_equipment"],
    vulnerability: ["medical_dependent"],
    trade: "electrician",
  },
  {
    text: "back door wont lock and the window got smashed, worried at night",
    category: "security",
    safety: "high",
    flags: ["security"],
    vulnerability: [],
    trade: "carpenter",
  },
  {
    text: "aircon dead, cant sleep, 40 degrees every night",
    category: "cooling",
    safety: "high",
    flags: ["no_cooling_extreme_heat"],
    vulnerability: [],
    trade: "hvac",
  },
  {
    text: "toilet blocked and its the only one in the house, backing up",
    category: "sanitation",
    safety: "high",
    flags: ["only_toilet_blocked", "sewage"],
    vulnerability: [],
    trade: "plumber",
  },
  {
    text: "water from the tap is brown and smells, worried for the kids",
    category: "water_quality",
    safety: "high",
    flags: ["water_contamination", "child_safety"],
    vulnerability: ["infants"],
    trade: "plumber",
  },
  {
    text: "stove stopped working, fridge died last week",
    category: "kitchen",
    safety: "medium",
    flags: [],
    vulnerability: [],
    trade: "handyperson",
  },
  {
    text: "shower head dripping and a tile cracked in the corner",
    category: "bathroom",
    safety: "low",
    flags: [],
    vulnerability: [],
    trade: "handyperson",
  },
  {
    text: "wheelchair ramp fell apart, cant get in the house",
    category: "accessibility",
    safety: "critical",
    flags: ["accessibility"],
    vulnerability: ["disability"],
    trade: "carpenter",
  },
];

describe("fallback parser — golden set", () => {
  for (const example of GOLDEN) {
    it(`parses: ${example.text.slice(0, 48)}...`, () => {
      const result = parseWithFallback(example.text);
      expect(result.category).toBe(example.category);
      expect(result.safety_level).toBe(example.safety);
      expect(new Set(result.urgency_flags)).toEqual(new Set(example.flags));
      expect(new Set(result.occupant_vulnerability)).toEqual(new Set(example.vulnerability));
      expect(result.trade_required).toBe(example.trade);
      expect(result.method).toBe("fallback");
    });
  }
});

describe("fallback parser — communities", () => {
  it("resolves a named community", () => {
    expect(parseWithFallback("no water for two days in Wadeye").community).toBe("Wadeye");
  });

  it("resolves an alias", () => {
    expect(parseWithFallback("aircon dead at Port Keats").community).toBe("Wadeye");
  });

  it("leaves community empty when none is named", () => {
    const result = parseWithFallback("tap is dripping");
    expect(result.community).toBe("");
    expect(result.notes.join(" ")).toMatch(/community/i);
  });
});

describe("parseWithFallback — word-start matching", () => {
  it("does not read 'tenant' as an elderly household member", () => {
    const p = parseWithFallback("Tenant reports a leak under the kitchen sink, Darwin");
    expect(p.occupant_vulnerability).not.toContain("elderly");
  });

  it("does not read 'occupants' as ants or 'cold' as old", () => {
    const p = parseWithFallback("only cold showers, three occupants, Katherine");
    expect(p.urgency_flags).not.toContain("vermin_pest");
    expect(p.occupant_vulnerability).not.toContain("elderly");
  });

  it("still matches a trigger at the start of a longer word", () => {
    const p = parseWithFallback("toilet overflowing into the yard, Wadeye");
    expect(p.urgency_flags).toContain("sewage");
  });
});

describe("parseWithFallback — fail-safe note", () => {
  it("asks for a person when no hazard is recognised", () => {
    const p = parseWithFallback("pawa point im sparkin, smok kamat longa Wadeye");
    expect(p.notes.join(" ")).toMatch(/A person should read this report/);
  });

  it("does not ask when a hazard is recognised", () => {
    const p = parseWithFallback("sparks coming out of the powerpoint, Wadeye");
    expect(p.notes.join(" ")).not.toMatch(/A person should read/);
  });
});
