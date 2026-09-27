import { buildJob } from "@/lib/engine/scoring";
import type { Job } from "@/lib/engine/types";
import { SEED_REPORTS } from "@/lib/data/seed";
import { getCommunity, getCommunityById } from "@/lib/data/communities";
import { parseWithFallback } from "@/lib/parser/fallback";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./client";
import { countReports, insertReport, listReports, mapReportRow } from "./repository";

/**
 * Seed the demo queue into the database the first time the app runs.
 *
 * The seed reports are parsed with the deterministic parser so the staged demo
 * is identical on every machine — no model and no network required.
 */
export function ensureSeeded(db: DatabaseSync = getDb()): void {
  if (countReports(db) > 0) return;
  for (const seed of SEED_REPORTS) {
    const parsed = parseWithFallback(seed.rawText);
    const community = getCommunity(parsed.community);
    insertReport(
      {
        id: seed.id,
        rawText: seed.rawText,
        report: parsed,
        household: seed.household,
        reportedAt: seed.reportedAt,
        communityId: community?.id ?? null,
        tier: community?.tier ?? null,
      },
      db,
    );
  }
}

/** Load the persisted queue as engine jobs (reseeding if the table is empty). */
export function loadJobs(db: DatabaseSync = getDb()): Job[] {
  ensureSeeded(db);
  const jobs: Job[] = [];
  for (const row of listReports(db)) {
    const community = row.community_id ? getCommunityById(row.community_id) : null;
    const { job } = buildJob({
      id: row.id,
      rawText: row.raw_text,
      reportedAt: row.created_at,
      household: row.household ?? community?.name,
      report: mapReportRow(row),
    });
    if (job) jobs.push(job);
  }
  return jobs;
}
