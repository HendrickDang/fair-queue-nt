import { NextResponse } from "next/server";
import { listAudit, listSchedulesWithJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Recent committed schedules + the raw audit trail, newest first. */
export async function GET() {
  return NextResponse.json({
    schedules: listSchedulesWithJobs(10),
    audit: listAudit(20),
  });
}
