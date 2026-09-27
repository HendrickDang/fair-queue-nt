import { describe, expect, it } from "vitest";
import { generateReports, generateReport } from "@/lib/data/generator";
import { Rng } from "@/lib/data/rng";
import {
  CATEGORIES,
  SAFETY_LEVELS,
  TRADES,
  URGENCY_FLAGS,
  VULNERABILITIES,
} from "@/lib/taxonomy";
import { escalateSafety } from "@/lib/engine/scoring";

describe("synthetic generator", () => {
  it("is deterministic for a given seed", () => {
    const a = generateReports(20, "seed-1");
    const b = generateReports(20, "seed-1");
    expect(a.map((r) => r.rawText)).toEqual(b.map((r) => r.rawText));
  });

  it("differs across seeds", () => {
    const a = generateReports(20, "seed-1").map((r) => r.rawText);
    const b = generateReports(20, "seed-2").map((r) => r.rawText);
    expect(a).not.toEqual(b);
  });

  it("emits valid enum labels", () => {
    for (const { label } of generateReports(200, "enum-check")) {
      expect(CATEGORIES).toContain(label.category);
      expect(SAFETY_LEVELS).toContain(label.safety_level);
      expect(TRADES).toContain(label.trade_required);
      for (const f of label.urgency_flags) expect(URGENCY_FLAGS).toContain(f);
      for (const v of label.occupant_vulnerability) expect(VULNERABILITIES).toContain(v);
      expect(label.community.length).toBeGreaterThan(0);
    }
  });

  it("labels match the engine's escalation rules", () => {
    for (const { label } of generateReports(200, "escalation-check")) {
      const escalated = escalateSafety({
        safety_level: label.safety_level,
        urgency_flags: label.urgency_flags,
        occupant_vulnerability: label.occupant_vulnerability,
      });
      expect(escalated).toBe(label.safety_level);
    }
  });

  it("names a real community", () => {
    const { communityId } = generateReport(new Rng("one"));
    expect(communityId.length).toBeGreaterThan(0);
  });
});
