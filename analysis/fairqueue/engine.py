"""
The ranking engine: need score, batching, efficiency score and the equity dial.

Mirrors nt-housing-triage/lib/engine/*.ts. The design rule the whole project
rests on is visible in the function signatures:

    score_need(job)            uses the report only. No location, no distance.
    score_efficiency(job, ..)  uses location, travel and batching.

The two are combined ONLY in rank_jobs(), through a single number lambda that
a person sets: 0 = rank purely on need, 1 = rank purely on travel efficiency.
"""

from dataclasses import dataclass, field

from .geo import (
    LABOUR_COST_PER_HOUR, base_for, haversine_km, mode_for, round_trip, travel_leg,
)
from .parser import escalate_safety
from .taxonomy import CATEGORY_DURATION_HOURS, FLAG_WEIGHT, SAFETY_BASE, VULNERABILITY_WEIGHT

HOURS_PER_DAY = 8
CLUSTER_KM = 200  # communities this close can share one service run

# The ONLY fields the need score may read. Location, tier, distance and cost
# are not in this list, so they cannot affect priority. tests/test_engine.py
# moves every job to a different community and checks its need is unchanged.
NEED_FIELDS = ("safety_level", "urgency_flags", "occupant_vulnerability")


@dataclass
class Job:
    id: str
    report: dict          # parsed report: category, safety_level, flags, vulnerability...
    community: object     # geo.Community
    reported_at: str = "2026-09-20T00:00:00+09:30"
    extra_need: float = 0.0   # used only by the ageing experiment (E4)
    base: object = field(init=False)

    def __post_init__(self):
        self.base = base_for(self.community)


# --- Need: location-blind ------------------------------------------------------

def score_need(job: Job) -> float:
    """(safety base + urgency flag weights) x vulnerability multiplier (capped at 2).
    Reads job.report only: the job's location never enters this function."""
    r = {k: job.report[k] for k in NEED_FIELDS}  # whitelist: nothing else gets in
    level = escalate_safety(r["safety_level"], r["urgency_flags"], r["occupant_vulnerability"])
    safety_score = SAFETY_BASE[level]
    flag_score = sum(FLAG_WEIGHT.get(f, 0) for f in r["urgency_flags"])
    vuln_bonus = sum(VULNERABILITY_WEIGHT.get(v, 0) for v in r["occupant_vulnerability"])
    multiplier = min(2, 1 + vuln_bonus)
    return (safety_score + flag_score) * multiplier + job.extra_need


# --- Batching: group jobs on one run so remote work shares the trip -----------

def _run_cost(base, communities):
    """Cost of one run: base -> each community (nearest first) -> back to base."""
    ordered = sorted(communities, key=lambda c: haversine_km(base, c))
    km = hours = cost = 0.0
    mode, prev = "road", base
    for c in ordered:
        leg_mode = mode_for("road" if prev is base else mode, c.access)
        leg = travel_leg(prev, c, leg_mode)
        km, hours, cost = km + leg["km"], hours + leg["hours"], cost + leg["cost"]
        mode, prev = leg_mode, c
    back = travel_leg(prev, base, mode)
    return {"km": km + back["km"], "hours": hours + back["hours"], "cost": cost + back["cost"], "mode": mode}


def build_batches(jobs):
    """Cluster communities within CLUSTER_KM (union-find), cost one combined run
    per cluster, and credit each job its share of the travel saved."""
    info = {}
    if not jobs:
        return [], info
    by_comm, comm = {}, {}
    for j in jobs:
        by_comm.setdefault(j.community.id, []).append(j)
        comm[j.community.id] = j.community

    parent = {}

    def find(x):
        parent.setdefault(x, x)
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    ids = list(by_comm)
    for i in ids:
        find(i)
    for i in range(len(ids)):
        for k in range(i + 1, len(ids)):
            if haversine_km(comm[ids[i]], comm[ids[k]]) <= CLUSTER_KM:
                ra, rb = find(ids[i]), find(ids[k])
                if ra != rb:
                    parent[ra] = rb

    clusters = {}
    for i in ids:
        clusters.setdefault(find(i), []).append(i)

    batches = []
    for root, cids in clusters.items():
        cluster_jobs = [j for cid in cids for j in by_comm[cid]]
        if len(cluster_jobs) < 2:  # a single job on its own is not a batch
            for j in cluster_jobs:
                info[j.id] = {"batch": None, "cost": 0.0, "km": 0.0, "hours": 0.0}
            continue
        communities = [comm[c] for c in cids]
        base = cluster_jobs[0].base
        solo = {c.id: round_trip(travel_leg(base, c, c.access)) for c in communities}
        solo_cost = sum(l["cost"] for l in solo.values())
        solo_km = sum(l["km"] for l in solo.values())
        solo_hours = sum(l["hours"] for l in solo.values())
        run = _run_cost(base, communities)
        saved = {
            "cost": max(0.0, solo_cost - run["cost"]),
            "km": max(0.0, solo_km - run["km"]),
            "hours": max(0.0, solo_hours - run["hours"]),
        }
        batch = {
            "id": f"batch-{root}",
            "communities": sorted(c.name for c in communities),
            "job_ids": sorted(j.id for j in cluster_jobs),
            "saved_cost": saved["cost"],
        }
        batches.append(batch)
        for j in cluster_jobs:
            # Share of the saving: this community's share of solo cost, split
            # between the jobs there, so a batch's credits sum to its saving.
            share = solo[j.community.id]["cost"] / solo_cost / len(by_comm[j.community.id]) if solo_cost > 0 else 0
            info[j.id] = {"batch": batch, **{k: v * share for k, v in saved.items()}}
    batches.sort(key=lambda b: -b["saved_cost"])
    return batches, info


# --- Efficiency: the cost of doing the job now, given where it is ---------------

def score_efficiency(job: Job, credit: dict) -> dict:
    solo = round_trip(travel_leg(job.base, job.community, job.community.access))
    travel_hours = max(0.0, solo["hours"] - credit["hours"])
    travel_cost = max(0.0, solo["cost"] - credit["cost"])
    labour_hours = CATEGORY_DURATION_HOURS[job.report["category"]] + travel_hours
    return {
        "score": travel_cost + labour_hours * LABOUR_COST_PER_HOUR,
        "travel_cost": travel_cost,
        "labour_hours": labour_hours,
        "travel_km": max(0.0, solo["km"] - credit["km"]),
    }


# --- The dial -------------------------------------------------------------------

def _min_max(values):
    lo, hi = min(values), max(values)
    rng = (hi - lo) or 1
    return lambda v: (v - lo) / rng


def rank_jobs(jobs, lam: float = 0.0, batching: bool = True):
    """Rank jobs two ways, then blend with the human-set dial lambda.

    adjusted = (1 - lambda) * need_normalised - lambda * efficiency_cost_normalised

    Returns a list of dicts in final queue order with need rank, efficiency
    rank, equity gap (efficiency rank - need rank) and estimated start day.
    """
    lam = min(1.0, max(0.0, lam))
    if batching:
        _, info = build_batches(jobs)
    else:
        info = {}
    zero = {"batch": None, "cost": 0.0, "km": 0.0, "hours": 0.0}
    scored = [
        {"job": j, "need": score_need(j), "eff": score_efficiency(j, info.get(j.id, zero)),
         "batch": info.get(j.id, zero)["batch"]}
        for j in jobs
    ]
    need_order = sorted(scored, key=lambda s: (-s["need"], s["job"].reported_at))
    eff_order = sorted(scored, key=lambda s: s["eff"]["score"])
    for i, s in enumerate(need_order):
        s["need_rank"] = i + 1
    for i, s in enumerate(eff_order):
        s["efficiency_rank"] = i + 1

    n_norm = _min_max([s["need"] for s in scored])
    e_norm = _min_max([s["eff"]["score"] for s in scored])
    for s in scored:
        s["adjusted"] = (1 - lam) * n_norm(s["need"]) - lam * e_norm(s["eff"]["score"])
        s["equity_gap"] = s["efficiency_rank"] - s["need_rank"]

    ranked = sorted(scored, key=lambda s: (-s["adjusted"], s["need_rank"]))
    hours = 0.0
    for i, s in enumerate(ranked):
        s["final_rank"] = i + 1
        hours += s["eff"]["labour_hours"]  # one crew working down the queue (as in the app)
        s["start_days"] = hours / HOURS_PER_DAY
    return ranked
