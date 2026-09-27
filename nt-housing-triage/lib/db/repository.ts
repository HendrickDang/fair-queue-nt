import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  Category,
  ParsedReport,
  SafetyLevel,
  Trade,
  UrgencyFlag,
  Vulnerability,
} from "@/lib/taxonomy";
import { getDb } from "./client";
import type {
  AuditRow,
  RankWrite,
  ReportInput,
  ReportRow,
  ScheduleInput,
  ScheduleWithJobs,
} from "./types";

/**
 * Repository for the triage SQLite database.
 *
 * Every function takes an optional `db` so callers (and tests) can inject a
 * connection; it defaults to the process-wide one from `getDb()`.
 */

function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function tx<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** Rebuild the parser's schema object from a stored row. */
export function mapReportRow(row: ReportRow): ParsedReport {
  return {
    summary: row.summary ?? "",
    category: (row.category ?? "other") as Category,
    safety_level: (row.safety_level ?? "medium") as SafetyLevel,
    urgency_flags: safeJson<UrgencyFlag[]>(row.urgency_flags, []),
    occupant_vulnerability: safeJson<Vulnerability[]>(row.occupant_vulnerability, []),
    trade_required: (row.trade_required ?? "handyperson") as Trade,
    community: row.community_id ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/* reports                                                                     */
/* -------------------------------------------------------------------------- */

export function insertReport(input: ReportInput, db: DatabaseSync = getDb()): void {
  const r = input.report;
  db.prepare(
    `INSERT INTO reports
       (id, raw_text, summary, category, safety_level, urgency_flags,
        occupant_vulnerability, trade_required, community_id, tier, household, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       raw_text = excluded.raw_text,
       summary = excluded.summary,
       category = excluded.category,
       safety_level = excluded.safety_level,
       urgency_flags = excluded.urgency_flags,
       occupant_vulnerability = excluded.occupant_vulnerability,
       trade_required = excluded.trade_required,
       community_id = excluded.community_id,
       tier = excluded.tier,
       household = excluded.household`,
  ).run(
    input.id,
    input.rawText,
    r.summary,
    r.category,
    r.safety_level,
    JSON.stringify(r.urgency_flags ?? []),
    JSON.stringify(r.occupant_vulnerability ?? []),
    r.trade_required,
    input.communityId ?? null,
    input.tier ?? null,
    input.household ?? null,
    input.reportedAt ?? new Date().toISOString(),
  );
}

export function getReport(id: string, db: DatabaseSync = getDb()): ReportRow | null {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  return (row as unknown as ReportRow) ?? null;
}

export function listReports(db: DatabaseSync = getDb()): ReportRow[] {
  return db
    .prepare("SELECT * FROM reports ORDER BY created_at ASC, id ASC")
    .all() as unknown as ReportRow[];
}

export function countReports(db: DatabaseSync = getDb()): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM reports").get() as unknown as { n: number };
  return row?.n ?? 0;
}

/** Write the engine's ranks back onto the report rows, atomically. */
export function saveRanks(entries: RankWrite[], db: DatabaseSync = getDb()): void {
  if (entries.length === 0) return;
  const stmt = db.prepare(
    "UPDATE reports SET need_rank = ?, efficiency_rank = ?, equity_gap = ? WHERE id = ?",
  );
  tx(db, () => {
    for (const e of entries) stmt.run(e.needRank, e.efficiencyRank, e.equityGap, e.id);
  });
}

/* -------------------------------------------------------------------------- */
/* schedules + audit                                                           */
/* -------------------------------------------------------------------------- */

export function appendAudit(
  entry: { actor: string; action: string; detail: string },
  db: DatabaseSync = getDb(),
): string {
  const id = `audit-${randomUUID()}`;
  db.prepare(
    "INSERT INTO audit_log (id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, entry.actor, entry.action, entry.detail, new Date().toISOString());
  return id;
}

export function listAudit(limit = 10, db: DatabaseSync = getDb()): AuditRow[] {
  return db
    .prepare("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(limit) as unknown as AuditRow[];
}

/**
 * Commit a schedule: one transaction writes the schedule, its ordered jobs, the
 * audit entry, and the committed ranks back onto the reports. Atomic, so the
 * "who / why" record can never be half-written.
 */
export function createSchedule(input: ScheduleInput, db: DatabaseSync = getDb()): string {
  const scheduleId = `sched-${randomUUID()}`;
  const now = new Date().toISOString();

  return tx(db, () => {
    db.prepare(
      "INSERT INTO schedules (id, equity_lambda, cost_note, created_at) VALUES (?, ?, ?, ?)",
    ).run(scheduleId, input.lambda, input.costNote ?? null, now);

    const insertJob = db.prepare(
      "INSERT INTO schedule_jobs (schedule_id, report_id, position, rationale) VALUES (?, ?, ?, ?)",
    );
    const updateRank = db.prepare(
      "UPDATE reports SET need_rank = ?, efficiency_rank = ?, equity_gap = ? WHERE id = ?",
    );
    for (const job of input.jobs) {
      insertJob.run(scheduleId, job.reportId, job.position, job.rationale);
      if (
        job.needRank !== undefined &&
        job.efficiencyRank !== undefined &&
        job.equityGap !== undefined
      ) {
        updateRank.run(job.needRank, job.efficiencyRank, job.equityGap, job.reportId);
      }
    }

    db.prepare(
      "INSERT INTO audit_log (id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      `audit-${randomUUID()}`,
      input.actor ?? "coordinator",
      input.action ?? "commit",
      input.detail ?? input.costNote ?? `Committed schedule at λ=${input.lambda}`,
      now,
    );

    return scheduleId;
  });
}

interface ScheduleJoinRow {
  s_id: string;
  s_lambda: number;
  s_cost: string | null;
  s_at: string;
  report_id: string | null;
  position: number | null;
  rationale: string | null;
  community_id: string | null;
  safety_level: string | null;
  need_rank: number | null;
}

/** Committed schedules with their ordered jobs, newest first. */
export function listSchedulesWithJobs(limit = 10, db: DatabaseSync = getDb()): ScheduleWithJobs[] {
  const rows = db
    .prepare(
      `SELECT s.id AS s_id, s.equity_lambda AS s_lambda, s.cost_note AS s_cost,
              s.created_at AS s_at,
              sj.report_id AS report_id, sj.position AS position, sj.rationale AS rationale,
              r.community_id AS community_id, r.safety_level AS safety_level, r.need_rank AS need_rank
         FROM schedules s
         LEFT JOIN schedule_jobs sj ON sj.schedule_id = s.id
         LEFT JOIN reports r ON r.id = sj.report_id
        ORDER BY s.created_at DESC, s.rowid DESC, sj.position ASC`,
    )
    .all() as unknown as ScheduleJoinRow[];

  const byId = new Map<string, ScheduleWithJobs>();
  for (const row of rows) {
    let schedule = byId.get(row.s_id);
    if (!schedule) {
      schedule = {
        id: row.s_id,
        at: row.s_at,
        lambda: row.s_lambda,
        narrative: row.s_cost ?? "",
        order: [],
      };
      byId.set(row.s_id, schedule);
    }
    if (row.report_id) {
      schedule.order.push({
        id: row.report_id,
        community: row.community_id,
        safety: row.safety_level,
        needRank: row.need_rank,
        position: row.position ?? 0,
        rationale: row.rationale ?? "",
      });
    }
  }
  return [...byId.values()].slice(0, limit);
}
