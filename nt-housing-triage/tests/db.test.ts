import { describe, expect, it } from "vitest";
import { createDb } from "@/lib/db/client";
import {
  createSchedule,
  insertReport,
  listAudit,
  listReports,
  listSchedulesWithJobs,
  mapReportRow,
} from "@/lib/db/repository";
import { parseWithFallback } from "@/lib/parser/fallback";

describe("triage SQLite repository", () => {
  it("round-trips a parsed report", () => {
    const db = createDb(":memory:");
    const report = parseWithFallback(
      "roof is leaking right over my kids bed and the ceiling is sagging in Wadeye",
    );
    insertReport({ id: "T-1", rawText: "roof...", report, communityId: "wadeye", tier: "T2" }, db);

    const rows = listReports(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("structural");

    const parsed = mapReportRow(rows[0]);
    expect(parsed.occupant_vulnerability).toContain("infants");
    expect(parsed.community).toBe("wadeye");
  });

  it("upserts on a repeated id instead of duplicating", () => {
    const db = createDb(":memory:");
    const report = parseWithFallback("ants everywhere in Lajamanu");
    insertReport({ id: "T-9", rawText: "first", report }, db);
    insertReport({ id: "T-9", rawText: "second", report }, db);

    const rows = listReports(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].raw_text).toBe("second");
  });

  it("commits a schedule with jobs and an audit entry atomically", () => {
    const db = createDb(":memory:");
    insertReport({ id: "T-1", rawText: "x", report: parseWithFallback("tap leaking, Darwin") }, db);
    insertReport({ id: "T-2", rawText: "y", report: parseWithFallback("sewage overflow, Ngukurr") }, db);

    const scheduleId = createSchedule(
      {
        lambda: 0.3,
        costNote: "saves $100, adds +1 median day for remote households",
        actor: "tester",
        jobs: [
          { reportId: "T-2", position: 1, rationale: "critical", needRank: 1, efficiencyRank: 2, equityGap: 1 },
          { reportId: "T-1", position: 2, rationale: "routine", needRank: 2, efficiencyRank: 1, equityGap: -1 },
        ],
      },
      db,
    );

    expect(scheduleId).toMatch(/^sched-/);

    const audit = listAudit(10, db);
    expect(audit).toHaveLength(1);
    expect(audit[0].actor).toBe("tester");
    expect(audit[0].action).toBe("commit");

    const schedules = listSchedulesWithJobs(10, db);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].narrative).toBe("saves $100, adds +1 median day for remote households");
    expect(schedules[0].order.map((o) => o.id)).toEqual(["T-2", "T-1"]);

    // Committed ranks are written back onto the report rows.
    const t2 = listReports(db).find((r) => r.id === "T-2");
    expect(t2?.need_rank).toBe(1);
    expect(t2?.equity_gap).toBe(1);
  });

  it("rolls back the whole commit if a job fails", () => {
    const db = createDb(":memory:");
    insertReport({ id: "T-1", rawText: "x", report: parseWithFallback("tap leaking, Darwin") }, db);

    expect(() =>
      createSchedule(
        {
          lambda: 0.5,
          jobs: [
            { reportId: "T-1", position: 1, rationale: "ok" },
            { reportId: "MISSING", position: 2, rationale: "fk violation" },
          ],
        },
        db,
      ),
    ).toThrow();

    // Nothing was half-written.
    expect(listAudit(10, db)).toHaveLength(0);
    expect(listSchedulesWithJobs(10, db)).toHaveLength(0);
  });
});
