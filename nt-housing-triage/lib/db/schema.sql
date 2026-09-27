-- NT Housing Maintenance Triage — SQLite schema.
--
-- Idempotent: safe to run on every boot (CREATE TABLE IF NOT EXISTS).
-- File lives at data/nt-triage.sqlite and is created on first run.
--
-- Mirrors `.opencode/plan/nt-housing-maintenance-triage.md` § Database (SQLite),
-- with one addition: `reports.household` so a loaded report keeps the tenant
-- reference the UI shows.

CREATE TABLE IF NOT EXISTS reports (
  id                     TEXT PRIMARY KEY,
  raw_text               TEXT NOT NULL,
  summary                TEXT,
  category               TEXT,
  safety_level           TEXT,
  urgency_flags          TEXT,               -- JSON array
  occupant_vulnerability TEXT,               -- JSON array
  trade_required         TEXT,
  community_id           TEXT,
  tier                   TEXT,
  household              TEXT,
  need_rank              INTEGER,            -- written back by the ranking engine
  efficiency_rank        INTEGER,
  equity_gap             INTEGER,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);

-- A committed schedule: the equity dial position the human signed off on.
CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY,
  equity_lambda REAL NOT NULL,               -- 0 = pure-fair … 1 = pure-efficient
  cost_note     TEXT,                        -- grounded narrative ("saves $4,800, +11 median days")
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The ordered jobs inside a committed schedule, with a grounded per-job rationale.
CREATE TABLE IF NOT EXISTS schedule_jobs (
  schedule_id TEXT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  report_id   TEXT NOT NULL REFERENCES reports(id),
  position    INTEGER NOT NULL,
  rationale   TEXT NOT NULL,
  PRIMARY KEY (schedule_id, report_id)
);

-- Append-only trail of human decisions — the trust twist, made durable.
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor      TEXT NOT NULL,                  -- who (coordinator / tenant escalation)
  action     TEXT NOT NULL,                  -- commit | re-rank | escalate | note
  detail     TEXT NOT NULL,                  -- what changed and why
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
