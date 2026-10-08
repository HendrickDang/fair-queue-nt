import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { seedJobs } from "@/lib/data/seed";
import { COMMUNITIES, baseForCommunity } from "@/lib/data/communities";
import { createDb } from "@/lib/db/client";
import { createSchedule, insertReport, listAudit, listReports, listSchedulesWithJobs, markReportRead } from "@/lib/db/repository";
import { rankJobs } from "@/lib/engine/rank";
import { buildJob, scoreNeed } from "@/lib/engine/scoring";
import type { Job } from "@/lib/engine/types";
import { tenantAnswer } from "@/lib/explainer";
import { parseWithFallback } from "@/lib/parser/fallback";
import { SAFETY_BASE } from "@/lib/taxonomy";
import { needBreakdown } from "@/lib/viz";

const UNREADABLE = "pawa point im sparkin, smok kamat longa Wadeye";

function jobFrom(text: string, needsReading: boolean): Job {
  const { job } = buildJob({ id: "T-1", rawText: text, reportedAt: "2026-10-01T09:00:00+09:30", report: parseWithFallback(text), needsReading });
  return job!;
}

describe("fail-safe hold in the need score", () => {
  it("scores an unread report with no recognised hazard as high", () => {
    const held = scoreNeed(jobFrom(UNREADABLE, true));
    expect(parseWithFallback(UNREADABLE).urgency_flags).toEqual([]);
    expect(held.heldForReading).toBe(true);
    expect(held.score).toBe(SAFETY_BASE.high);
    expect(held.holdPoints).toBeGreaterThan(0);
  });

  it("goes back to the parsed score once a person has read it", () => {
    const read = scoreNeed(jobFrom(UNREADABLE, false));
    expect(read.heldForReading).toBe(false);
    expect(read.holdPoints).toBe(0);
    expect(read.score).toBeLessThan(SAFETY_BASE.high);
  });

  it("never lowers a score, and leaves reports already high or critical unchanged", () => {
    for (const job of seedJobs()) {
      const plain = scoreNeed(job);
      const held = scoreNeed({ ...job, needsReading: true });
      expect(held.score).toBeGreaterThanOrEqual(plain.score);
      if (plain.safetyScore >= SAFETY_BASE.high) expect(held.holdPoints).toBe(0);
    }
  });

  it("is location-blind: the hold scores the same in every community", () => {
    const base = jobFrom(UNREADABLE, true);
    const expected = scoreNeed(base).score;
    for (const community of COMMUNITIES) {
      expect(scoreNeed({ ...base, community, base: baseForCommunity(community) } as Job).score).toBe(expected);
    }
  });

  it("moves a held job ahead of where it would sit unread, and the score parts still add up", () => {
    const options = { ageing: 1, now: "2026-10-08T09:00:00+09:30" };
    const queue = seedJobs();
    const target = queue.find((j) => j.report.urgency_flags.length === 0)!;
    const before = rankJobs(queue, options).byId[target.id];
    const after = rankJobs(queue.map((j) => (j.id === target.id ? { ...j, needsReading: true } : j)), options).byId[target.id];
    expect(after.finalRank).toBeLessThan(before.finalRank);
    const { parts } = needBreakdown(after.need);
    expect(parts.some((p) => p.key === "hold")).toBe(true);
    expect(parts.reduce((sum, p) => sum + p.points, 0)).toBeCloseTo(after.need.score, 10);
  });

  it("tells the tenant their report is held for a person to read", () => {
    const queue = seedJobs().map((j) => ({ ...j, needsReading: j.report.urgency_flags.length === 0 }));
    const { ranked } = rankJobs(queue);
    const held = ranked.find((r) => r.need.heldForReading)!;
    expect(tenantAnswer(held, { ranked }).body.join(" ")).toContain("held at high priority until a person reads it");
  });
});

describe("fail-safe hold in the database", () => {
  it("stores the hold, lifts it when read, and records who read it", () => {
    const db = createDb(":memory:");
    insertReport({ id: "T-1", rawText: UNREADABLE, report: parseWithFallback(UNREADABLE), needsReading: true }, db);
    expect(listReports(db)[0].needs_reading).toBe(1);

    expect(markReportRead({ id: "T-1", level: "critical", actor: "coordinator" }, db)).toBe(true);
    const row = listReports(db)[0];
    expect(row.needs_reading).toBe(0);
    expect(row.safety_level).toBe("critical"); // the person who read it set the level
    expect(listAudit(5, db)[0]).toMatchObject({ action: "read", actor: "coordinator" });
    expect(markReportRead({ id: "nope", level: null, actor: "x" }, db)).toBe(false);
  });

  it("keeps the parsed level when the reader confirms it is routine", () => {
    const db = createDb(":memory:");
    const report = parseWithFallback("tap leaking under the sink for weeks, Darwin");
    insertReport({ id: "T-2", rawText: "tap", report, needsReading: true }, db);
    markReportRead({ id: "T-2", level: null, actor: "coordinator" }, db);
    expect(listReports(db)[0]).toMatchObject({ needs_reading: 0, safety_level: report.safety_level });
  });

  it("never lowers a level: 'high' on a critical report leaves it critical", () => {
    const db = createDb(":memory:");
    const report = parseWithFallback("roof is leaking over the kids bed and the ceiling is sagging in Wadeye");
    expect(report.safety_level).toBe("critical");
    insertReport({ id: "T-3", rawText: "roof", report, needsReading: true }, db);
    markReportRead({ id: "T-3", level: "high", actor: "coordinator" }, db);
    expect(listReports(db)[0].safety_level).toBe("critical");
  });

  it("upgrades a database made by an older version without losing rows", () => {
    const path = join(mkdtempSync(join(tmpdir(), "nt-triage-")), "old.sqlite");
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE reports (id TEXT PRIMARY KEY, raw_text TEXT NOT NULL, summary TEXT, category TEXT,
      safety_level TEXT, urgency_flags TEXT, occupant_vulnerability TEXT, trade_required TEXT, community_id TEXT,
      tier TEXT, household TEXT, need_rank INTEGER, efficiency_rank INTEGER, equity_gap INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE schedules (id TEXT PRIMARY KEY, equity_lambda REAL NOT NULL, cost_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO reports (id, raw_text) VALUES ('OLD-1', 'an old report');
      INSERT INTO schedules (id, equity_lambda) VALUES ('sched-old', 0.4);`);
    old.close();

    const db = createDb(path);
    expect(listReports(db)).toHaveLength(1);
    expect(listReports(db)[0].needs_reading).toBe(0); // old reports are not suddenly held
    expect(listSchedulesWithJobs(5, db)[0]).toMatchObject({ id: "sched-old", role: null, reason: null });
    db.close();
  });
});

describe("an owned commit", () => {
  it("records the role, the person and the reason, and shows the tenant the role and reason only", () => {
    const db = createDb(":memory:");
    const report = parseWithFallback("roof is leaking over the kids bed in Wadeye");
    insertReport({ id: "T-1", rawText: "roof", report }, db);
    createSchedule(
      {
        lambda: 0.4,
        costNote: "note",
        decidedRole: "Regional housing manager",
        decidedName: "Sam Example",
        reason: "Only one plumber is available this week.",
        jobs: [{ reportId: "T-1", position: 1, rationale: "first" }],
      },
      db,
    );
    const saved = listSchedulesWithJobs(1, db)[0];
    expect(saved).toMatchObject({ role: "Regional housing manager", name: "Sam Example", reason: "Only one plumber is available this week." });
    const audit = listAudit(1, db)[0];
    expect(audit.actor).toBe("Sam Example (Regional housing manager)");
    expect(audit.detail).toContain("Reason given: Only one plumber is available this week.");

    const jobs = seedJobs();
    const { ranked } = rankJobs(jobs, { lambda: 1 });
    const pushed = ranked.find((r) => r.movedByDial > 0)!;
    const text = tenantAnswer(pushed, {
      ranked,
      decision: { lambda: 1, decidedBy: `the ${saved.role!.toLowerCase()}`, decidedAt: saved.at, reason: saved.reason },
    }).body.join(" ");
    expect(text).toContain("the regional housing manager decided");
    expect(text).toContain('The reason recorded was: "Only one plumber is available this week".');
    expect(text).not.toContain("Sam Example");
  });
});
