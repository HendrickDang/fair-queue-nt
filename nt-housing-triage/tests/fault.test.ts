import { describe, expect, it } from "vitest";
import { seedJobs } from "@/lib/data/seed";
import { CATEGORIES, URGENCY_FLAGS } from "@/lib/taxonomy";
import { FAULT_LABEL, ZONE_LABEL, faultKind, houseZones } from "@/lib/ui/fault";

// The drawings are only a view of the parsed report, so these tests pin the
// mapping from report to picture.
describe("faultKind", () => {
  it("has a label for every category", () => {
    for (const category of CATEGORIES) {
      expect(FAULT_LABEL[faultKind({ category, urgency_flags: [] })]).toBeTruthy();
    }
  });

  it("shows pest reports as pests, not as 'other'", () => {
    expect(faultKind({ category: "other", urgency_flags: ["vermin_pest"] })).toBe("pest");
    expect(faultKind({ category: "other", urgency_flags: [] })).toBe("other");
  });
});

describe("houseZones", () => {
  it("lights the part each example report is about", () => {
    expect(houseZones({ category: "structural", urgency_flags: ["structural"] })).toEqual(["roof"]);
    expect(houseZones({ category: "electrical", urgency_flags: ["exposed_wiring", "medical_equipment"] })).toEqual(["wiring", "medical"]);
    expect(houseZones({ category: "sanitation", urgency_flags: ["sewage"] })).toEqual(["toilet", "sewer"]);
    expect(houseZones({ category: "plumbing", urgency_flags: ["no_water"] })).toEqual(["tap", "tank"]);
  });

  it("never repeats a part and only returns parts the diagram can draw", () => {
    for (const category of CATEGORIES) {
      const zones = houseZones({ category, urgency_flags: [...URGENCY_FLAGS] });
      expect(new Set(zones).size).toBe(zones.length);
      for (const zone of zones) expect(ZONE_LABEL[zone]).toBeTruthy();
    }
  });

  it("lights at least one part for every seeded report except plain 'other'", () => {
    for (const job of seedJobs()) {
      const zones = houseZones(job.report);
      if (faultKind(job.report) !== "other") expect(zones.length).toBeGreaterThan(0);
    }
  });
});

// The tenant's street drawing and the tenant's written answer must give the same counts.
import { rankJobs } from "@/lib/engine/rank";
import { aheadOf, tenantAnswer } from "@/lib/explainer";

describe("aheadOf", () => {
  const jobs = seedJobs();
  const options = { ageing: 1, now: "2026-10-08T09:00:00+09:30" };

  it("lists exactly the jobs ranked ahead, in queue order, at every dial setting", () => {
    for (const lambda of [0, 0.4, 1]) {
      const { ranked } = rankJobs(jobs, { ...options, lambda });
      for (const r of ranked) {
        const ahead = aheadOf(r, ranked);
        expect(ahead.map((a) => a.job.finalRank)).toEqual(Array.from({ length: r.finalRank - 1 }, (_, i) => i + 1));
      }
    }
  });

  it("matches the counts in the tenant's written answer", () => {
    const { ranked } = rankJobs(jobs, { ...options, lambda: 1 });
    for (const r of ranked.filter((x) => x.finalRank > 1)) {
      const ahead = aheadOf(r, ranked);
      const urgent = ahead.filter((a) => a.reason === "more_urgent").length;
      const line = tenantAnswer(r, { ranked, lambda: 1 }).body.find((l) => l.includes("ahead of yours"))!;
      expect(line).toContain(`${ahead.length} repair`);
      expect(line).toContain(`${urgent} of them`);
    }
  });

  it("says nobody is ahead of the first job", () => {
    const { ranked } = rankJobs(jobs, options);
    expect(aheadOf(ranked[0], ranked)).toEqual([]);
  });
});
