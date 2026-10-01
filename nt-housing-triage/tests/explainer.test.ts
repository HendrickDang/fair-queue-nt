import { describe, expect, it } from "vitest";
import { rankJobs } from "@/lib/engine/rank";
import { seedJobs } from "@/lib/data/seed";
import { TARGET_WORKING_DAYS, tenantAnswer } from "@/lib/explainer";

/**
 * The tenant answer is the "real answer" the brief asks for. These tests pin
 * the parts that make it real: it names who decided, it says what is ahead and
 * why, and it gives the tenant a lever and a human review path.
 */
describe("tenantAnswer", () => {
  const jobs = seedJobs();
  const decision = {
    lambda: 0.6,
    decidedBy: "the maintenance coordinator",
    decidedAt: "2026-10-01T09:00:00+09:30",
  };
  const result = rankJobs(jobs, { lambda: decision.lambda });
  const today = new Date("2026-10-01T09:00:00+09:30");

  // Pick a job that the dial actually pushed down, so the trade-off is visible.
  const pushed = result.ranked.find((r) => r.movedByDial > 0)!;

  it("finds at least one job the dial pushed down at lambda 0.6", () => {
    expect(pushed).toBeDefined();
  });

  it("names the person who owns the trade-off, not 'the system'", () => {
    const a = tenantAnswer(pushed, { ranked: result.ranked, decision, today });
    const text = a.body.join(" ");
    expect(text).toContain("the maintenance coordinator decided");
    expect(text).toContain("recorded and can be reviewed");
    expect(text.toLowerCase()).not.toContain("the algorithm decided");
  });

  it("says how many repairs are ahead and how many are more urgent", () => {
    const a = tenantAnswer(pushed, { ranked: result.ranked, decision, today });
    const ahead = pushed.finalRank - 1;
    expect(a.body.join(" ")).toContain(`${ahead} repair`);
    expect(a.body.join(" ")).toMatch(/rated more urgent for safety/);
  });

  it("gives the tenant a lever and a human review path", () => {
    const a = tenantAnswer(pushed, { ranked: result.ranked, decision, today });
    expect(a.whatWouldChange).toMatch(/medical equipment/);
    expect(a.escalation).toMatch(/A person will look at it/);
  });

  it("never states a figure that is not on the ranked job", () => {
    const a = tenantAnswer(pushed, { ranked: result.ranked, decision, today });
    expect(a.headline).toBe(`Your repair is #${pushed.finalRank} of ${result.ranked.length} in the queue`);
  });

  it("admits when the expected visit misses the safety target", () => {
    const late = result.ranked.find(
      (r) => Math.ceil(r.estimatedStartDays) > TARGET_WORKING_DAYS[r.job.report.safety_level],
    )!;
    const a = tenantAnswer(late, { ranked: result.ranked, decision, today });
    expect(a.body.join(" ")).toContain("later than our target");
  });

  it("does not repeat the community name when the summary already has it", () => {
    const wadeye = result.byId["JOB-1042"];
    const a = tenantAnswer(wadeye, { ranked: result.ranked, decision, today });
    expect(a.body[0]).not.toMatch(/\(Wadeye\)/);
  });
});
