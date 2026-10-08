import type { ParsedReport } from "@/lib/taxonomy";

/** Raw row shapes as stored in SQLite (arrays are JSON strings). */
export interface ReportRow {
  id: string;
  raw_text: string;
  summary: string | null;
  category: string | null;
  safety_level: string | null;
  urgency_flags: string | null;
  occupant_vulnerability: string | null;
  trade_required: string | null;
  community_id: string | null;
  tier: string | null;
  household: string | null;
  need_rank: number | null;
  efficiency_rank: number | null;
  equity_gap: number | null;
  created_at: string;
  /** 1 while the report is held for a person to read (fail-safe). */
  needs_reading: number;
}

export interface ScheduleRow {
  id: string;
  equity_lambda: number;
  cost_note: string | null;
  created_at: string;
  decided_role: string | null;
  decided_name: string | null;
  reason: string | null;
}

export interface ScheduleJobRow {
  schedule_id: string;
  report_id: string;
  position: number;
  rationale: string;
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  detail: string;
  created_at: string;
}

/** What the writer supplies to persist a parsed report. */
export interface ReportInput {
  id: string;
  rawText: string;
  report: ParsedReport;
  household?: string | null;
  /** When the tenant reported it; defaults to now. Drives queue tie-breaking. */
  reportedAt?: string | null;
  communityId?: string | null;
  tier?: string | null;
  /** Hold the report at high priority until a person has read it. */
  needsReading?: boolean;
}

export interface RankWrite {
  id: string;
  needRank: number;
  efficiencyRank: number;
  equityGap: number;
}

export interface ScheduleJobInput {
  reportId: string;
  position: number;
  rationale: string;
  /** Optional: committed ranks are written back onto the report row. */
  needRank?: number;
  efficiencyRank?: number;
  equityGap?: number;
}

export interface ScheduleInput {
  lambda: number;
  costNote?: string | null;
  actor?: string;
  action?: string;
  detail?: string | null;
  /** The role that owns the decision, e.g. "Maintenance coordinator". Shown to tenants. */
  decidedRole?: string | null;
  /** The person who committed it. Kept in the audit trail, never shown to tenants. */
  decidedName?: string | null;
  /** Why travel cost was given weight, in the decider's own words. */
  reason?: string | null;
  jobs: ScheduleJobInput[];
}

/** A committed schedule with its ordered jobs, as read back for the UI. */
export interface ScheduleWithJobs {
  id: string;
  at: string;
  lambda: number;
  narrative: string;
  role: string | null;
  name: string | null;
  reason: string | null;
  order: {
    id: string;
    community: string | null;
    safety: string | null;
    needRank: number | null;
    position: number;
    rationale: string;
  }[];
}
