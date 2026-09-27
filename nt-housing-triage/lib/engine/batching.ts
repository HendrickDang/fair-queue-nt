import { haversineKm, type Community, type TradeBase } from "@/lib/data/communities";
import { modeFor, roundTrip, travelLeg, type TravelLeg } from "@/lib/data/distances";
import type { AccessMode } from "@/lib/taxonomy";
import type { Batch, Job } from "./types";

/**
 * Batching = reconciliation, not sacrifice.
 *
 * Jobs in the same community — or in neighbouring communities reachable on one
 * service run — are grouped into a cluster. The cluster's combined trip cost is
 * compared with visiting each community separately, and the saving is credited
 * back to the jobs in the batch. This is what lets a remote job "recover places
 * at ~zero extra cost".
 */

/** Two communities can share a run when they are within this distance. */
export const CLUSTER_KM = 200;

export interface JobBatchInfo {
  batch: Batch | null;
  bonusCost: number;
  bonusKm: number;
  bonusHours: number;
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined || p === x) {
      this.parent.set(x, x);
      return x;
    }
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function legBetween(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  mode: AccessMode,
): TravelLeg {
  return travelLeg(from, to, mode);
}

/**
 * Cost of a single service run that starts at the base, visits every community
 * in the cluster once and returns to the base.
 */
function runCost(base: TradeBase, communities: Community[]) {
  const ordered = [...communities].sort(
    (a, b) => haversineKm(base, a) - haversineKm(base, b),
  );
  let km = 0;
  let hours = 0;
  let cost = 0;
  let mode: AccessMode = "road";
  let prev: { lat: number; lon: number } = base;
  for (const c of ordered) {
    const legMode = modeFor(prev === base ? "road" : mode, c.access);
    const leg = legBetween(prev, c, legMode);
    km += leg.km;
    hours += leg.hours;
    cost += leg.cost;
    mode = legMode;
    prev = c;
  }
  const back = legBetween(prev, base, mode);
  km += back.km;
  hours += back.hours;
  cost += back.cost;
  return { km, hours, cost, mode };
}

export function buildBatches(jobs: Job[]): {
  batches: Batch[];
  info: Map<string, JobBatchInfo>;
} {
  const info = new Map<string, JobBatchInfo>();
  if (jobs.length === 0) return { batches: [], info };

  // Group jobs by community.
  const jobsByCommunity = new Map<string, Job[]>();
  const communityById = new Map<string, Community>();
  for (const job of jobs) {
    const list = jobsByCommunity.get(job.community.id) ?? [];
    list.push(job);
    jobsByCommunity.set(job.community.id, list);
    communityById.set(job.community.id, job.community);
  }

  // Cluster the communities that have work.
  const uf = new UnionFind();
  const communityIds = [...jobsByCommunity.keys()];
  for (const id of communityIds) uf.find(id);
  for (let i = 0; i < communityIds.length; i++) {
    for (let j = i + 1; j < communityIds.length; j++) {
      const a = communityById.get(communityIds[i])!;
      const b = communityById.get(communityIds[j])!;
      if (haversineKm(a, b) <= CLUSTER_KM) uf.union(a.id, b.id);
    }
  }

  const clusters = new Map<string, string[]>();
  for (const id of communityIds) {
    const root = uf.find(id);
    const list = clusters.get(root) ?? [];
    list.push(id);
    clusters.set(root, list);
  }

  const batches: Batch[] = [];
  for (const [root, ids] of clusters) {
    const clusterJobs = ids.flatMap((id) => jobsByCommunity.get(id)!);
    // A single job on its own is not a batch.
    if (clusterJobs.length < 2) {
      for (const job of clusterJobs) {
        info.set(job.id, { batch: null, bonusCost: 0, bonusKm: 0, bonusHours: 0 });
      }
      continue;
    }

    const communities = ids.map((id) => communityById.get(id)!);
    const base = clusterJobs[0].base;

    // Solo cost: one round trip per community.
    let soloCost = 0;
    let soloKm = 0;
    let soloHours = 0;
    const soloByCommunity = new Map<string, TravelLeg>();
    for (const c of communities) {
      const leg = roundTrip(legBetween(base, c, c.access));
      soloByCommunity.set(c.id, leg);
      soloCost += leg.cost;
      soloKm += leg.km;
      soloHours += leg.hours;
    }

    const run = runCost(base, communities);
    const savedCost = Math.max(0, soloCost - run.cost);
    const savedKm = Math.max(0, soloKm - run.km);
    const savedHours = Math.max(0, soloHours - run.hours);

    const names = communities
      .map((c) => c.name)
      .sort((a, b) => a.localeCompare(b));
    const batch: Batch = {
      id: `batch-${root}`,
      label: names.join(" + "),
      communityIds: communities.map((c) => c.id).sort(),
      communityNames: names,
      jobIds: clusterJobs.map((j) => j.id).sort(),
      mode: run.mode,
      soloCost,
      batchCost: run.cost,
      savedCost,
      savedKm,
      savedHours,
    };
    batches.push(batch);

    // Credit each job its share of the saving, proportional to its solo cost.
    for (const job of clusterJobs) {
      const share = soloCost > 0 ? (soloByCommunity.get(job.community.id)!.cost / soloCost) : 0;
      info.set(job.id, {
        batch,
        bonusCost: savedCost * share,
        bonusKm: savedKm * share,
        bonusHours: savedHours * share,
      });
    }
  }

  batches.sort((a, b) => b.savedCost - a.savedCost);
  return { batches, info };
}
