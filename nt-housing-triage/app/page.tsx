import Dashboard from "./components/Dashboard";
import { loadJobs } from "@/lib/db";

// The queue lives in SQLite; read it per request rather than at build time.
export const dynamic = "force-dynamic";

export default function Page() {
  const jobs = loadJobs();
  return <Dashboard initialJobs={jobs} />;
}
