/**
 * SQLite persistence for the triage app.
 *
 * Server-only: this module pulls in `node:sqlite`. Client components must import
 * types from `@/lib/db/types` instead, never from here.
 */
export * from "./types";
export { createDb, defaultDbPath, getDb } from "./client";
export {
  appendAudit,
  countReports,
  createSchedule,
  getReport,
  insertReport,
  listAudit,
  listReports,
  listSchedulesWithJobs,
  mapReportRow,
  saveRanks,
} from "./repository";
export { ensureSeeded, loadJobs } from "./seed";
