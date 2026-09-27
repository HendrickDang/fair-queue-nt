import { rmSync } from "node:fs";
import { join } from "node:path";

/**
 * Delete the local triage database. The app reseeds the demo queue on next run.
 *
 *   npm run db:reset
 */
for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(join(process.cwd(), "data", `nt-triage.sqlite${suffix}`), { force: true });
}
console.log("nt-triage: local database reset — it will reseed on the next run.");
