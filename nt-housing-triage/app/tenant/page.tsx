import TenantView from "../components/TenantView";
import { loadJobs } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TenantPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  const jobs = loadJobs();
  return <TenantView jobs={jobs} initialJobId={job ?? jobs[0]?.id ?? null} />;
}
