import TenantView from "../components/TenantView";
import { listSchedulesWithJobs, loadJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  const jobs = loadJobs();

  // The tenant sees the order the coordinator actually committed, not a dial
  // they can move themselves. With nothing committed yet, the queue is need-only.
  const latest = listSchedulesWithJobs(1)[0] ?? null;
  const decision = latest
    ? { lambda: latest.lambda, decidedBy: "the maintenance coordinator", decidedAt: latest.at }
    : null;

  return (
    <TenantView jobs={jobs} initialJobId={job ?? jobs[0]?.id ?? null} decision={decision} />
  );
}
