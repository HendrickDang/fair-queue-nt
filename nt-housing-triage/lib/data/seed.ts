import { buildJob } from "@/lib/engine/scoring";
import type { Job } from "@/lib/engine/types";
import { parseWithFallback } from "@/lib/parser/fallback";

/**
 * Seeded demo queue.
 *
 * Curated so the equity story stages on cue: a critical Wadeye roof with young
 * children, plus nearby West Daly jobs that can be batched, alongside urban
 * jobs that are cheap to fix. Parsing runs through the deterministic parser so
 * the demo is fully offline and reproducible.
 */

interface SeedReport {
  id: string;
  rawText: string;
  household: string;
  reportedAt: string;
}

export const SEED_REPORTS: SeedReport[] = [
  {
    id: "JOB-1042",
    rawText: "roof is leaking right over my kids bed and the ceiling is sagging, storm did it, in Wadeye",
    household: "Wadeye house 14",
    reportedAt: "2026-09-22T08:10:00+09:30",
  },
  {
    id: "JOB-1043",
    rawText: "no water at all for two days and its 42 degrees, got a baby and my nan here, Palumpa",
    household: "Palumpa house 3",
    reportedAt: "2026-09-22T09:40:00+09:30",
  },
  {
    id: "JOB-1044",
    rawText: "sparks coming out of the powerpoint near the oxygen machine, Peppimenarti",
    household: "Peppimenarti house 7",
    reportedAt: "2026-09-22T11:05:00+09:30",
  },
  {
    id: "JOB-1045",
    rawText: "tap leaking under the sink for weeks, Darwin",
    household: "Darwin unit 2",
    reportedAt: "2026-09-19T13:20:00+09:30",
  },
  {
    id: "JOB-1046",
    rawText: "aircon not cooling properly and its 40 degrees, Alice Springs",
    household: "Alice Springs house 21",
    reportedAt: "2026-09-20T15:00:00+09:30",
  },
  {
    id: "JOB-1047",
    rawText: "toilet blocked and its the only one in the house, backing up, Maningrida",
    household: "Maningrida house 9",
    reportedAt: "2026-09-21T07:30:00+09:30",
  },
  {
    id: "JOB-1048",
    rawText: "stove stopped working, fridge died last week, Katherine",
    household: "Katherine house 5",
    reportedAt: "2026-09-18T10:00:00+09:30",
  },
  {
    id: "JOB-1049",
    rawText: "water from the tap is brown and smells, worried for the kids, Yuendumu",
    household: "Yuendumu house 11",
    reportedAt: "2026-09-21T16:45:00+09:30",
  },
  {
    id: "JOB-1050",
    rawText: "wheelchair ramp fell apart, cant get in the house, Tennant Creek",
    household: "Tennant Creek house 2",
    reportedAt: "2026-09-20T08:15:00+09:30",
  },
  {
    id: "JOB-1051",
    rawText: "oxygen machine has no power, Galiwin'ku",
    household: "Galiwin'ku house 4",
    reportedAt: "2026-09-22T06:50:00+09:30",
  },
  {
    id: "JOB-1052",
    rawText: "back door wont lock and the window got smashed, worried at night, Borroloola",
    household: "Borroloola house 8",
    reportedAt: "2026-09-19T20:30:00+09:30",
  },
  {
    id: "JOB-1053",
    rawText: "ants everywhere in the kitchen, Lajamanu",
    household: "Lajamanu house 6",
    reportedAt: "2026-09-17T12:00:00+09:30",
  },
  {
    id: "JOB-1054",
    rawText: "lights flicker and trip the box, Darwin",
    household: "Darwin unit 12",
    reportedAt: "2026-09-20T18:20:00+09:30",
  },
  {
    id: "JOB-1055",
    rawText: "sewage overflowing outside the back door, Ngukurr",
    household: "Ngukurr house 1",
    reportedAt: "2026-09-22T07:05:00+09:30",
  },
];

export function seedJobs(): Job[] {
  const jobs: Job[] = [];
  for (const seed of SEED_REPORTS) {
    const report = parseWithFallback(seed.rawText);
    const { job } = buildJob({
      id: seed.id,
      rawText: seed.rawText,
      household: seed.household,
      reportedAt: seed.reportedAt,
      report,
    });
    if (job) jobs.push(job);
  }
  return jobs;
}
