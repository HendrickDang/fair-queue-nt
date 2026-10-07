import Dashboard from "./components/Dashboard";
import { loadJobs } from "@/lib/db";

// The queue lives in SQLite; read it per request rather than at build time.
export const dynamic = "force-dynamic";

export default function Page() {
  const jobs = loadJobs();
  // One "now" for the whole page, taken on the server and sent with the HTML, so the
  // waiting-time maths gives the same answer on the server and in the browser.
  const now = new Date().toISOString();
  return <Dashboard initialJobs={jobs} now={now} />;
}
