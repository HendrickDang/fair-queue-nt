"""
Simulations used by the experiments.

Two scheduling models, both deliberately simple and stated in the report:

  snapshot_schedule()  one queue, one crew per trade base. Each crew works
                       down the ranked queue for its own base, 8 hours a day.
                       Gives "working days until the job is done".

  weekly_simulation()  52+ weeks. New reports arrive every week, each base has
                       a fixed number of crew-hours per week, and the backlog
                       is re-ranked weekly. Used to test whether a moderate
                       travel-cost weight starves remote jobs over time, and
                       whether an "ageing" term (priority grows while a job
                       waits) prevents it.
"""

import numpy as np

from .engine import HOURS_PER_DAY, Job, rank_jobs
from .generator import label, sample_queue
from .taxonomy import TARGET_WORKING_DAYS


def make_jobs(pairs, prefix="J"):
    """Turn (scenario, community) pairs into engine Jobs with true labels.
    Using true labels isolates the ranking policy from parser errors (E3)."""
    return [Job(f"{prefix}{i:04d}", label(s, c), c) for i, (s, c) in enumerate(pairs)]


def snapshot_schedule(ranked):
    """Days until done for each job: one crew per base works the ranked order."""
    used = {}
    out = []
    for s in ranked:
        b = s["job"].base.id
        used[b] = used.get(b, 0.0) + s["eff"]["labour_hours"]
        out.append((s, used[b] / HOURS_PER_DAY))
    return out


def snapshot_metrics(ranked):
    """Per-queue outcome measures at one dial setting."""
    rows = []
    for s, days in snapshot_schedule(ranked):
        j = s["job"]
        level = j.report["safety_level"]
        rows.append({
            "remote": j.community.remote,
            "urgent": level in ("critical", "high"),
            "days": days,
            "late": days > TARGET_WORKING_DAYS[level],
            "need": s["need"],
            "rank_pct": s["final_rank"] / len(ranked),
            "travel_cost": s["eff"]["travel_cost"],
        })
    return rows


def weekly_simulation(rng, lam, weeks=60, burn_in=8, arrivals_per_week=30,
                      capacity=None, ageing=0.0, remote_share=0.5):
    """Re-rank the open backlog every week and work it with fixed capacity.

    ageing: need points added per week a job has waited (0 = no ageing).
    capacity: crew-hours per week per trade base id.
    Returns one row per job completed after burn-in, plus jobs still open at the end.
    """
    backlog, done = [], []
    next_id = 0
    carry = {b: 0.0 for b in capacity}  # hours a crew overran last week
    for week in range(weeks):
        n_new = rng.poisson(arrivals_per_week)
        for j in make_jobs(sample_queue(rng, n_new, remote_share), prefix=f"W{week}-"):
            j.arrived = week
            backlog.append(j)
            next_id += 1
        if not backlog:
            continue
        for j in backlog:  # ageing: waiting raises priority, whatever the location
            j.extra_need = ageing * (week - j.arrived)
        ranked = rank_jobs(backlog, lam, batching=True)
        # A crew may start a job whenever it has hours left this week; any
        # overrun is carried into next week (long remote trips span weeks).
        left = {b: capacity[b] - carry[b] for b in capacity}
        finished = set()
        for s in ranked:
            j = s["job"]
            h = s["eff"]["labour_hours"]
            if left.get(j.base.id, 0) > 0:
                left[j.base.id] -= h
                finished.add(j.id)
                if j.arrived >= burn_in:
                    done.append({"remote": j.community.remote,
                                 "level": j.report["safety_level"],
                                 "wait_weeks": week - j.arrived, "open": False})
        carry = {b: max(0.0, -left[b]) for b in capacity}
        backlog = [j for j in backlog if j.id not in finished]
    for j in backlog:  # still waiting when the simulation ends
        if j.arrived >= burn_in:
            done.append({"remote": j.community.remote, "level": j.report["safety_level"],
                         "wait_weeks": weeks - j.arrived, "open": True})
    return done


def base_capacity(rng, arrivals_per_week, utilisation, remote_share=0.5, sample=4000):
    """Crew-hours per base per week so that demand / capacity = utilisation,
    where demand is measured on solo (unbatched) trips."""
    jobs = make_jobs(sample_queue(rng, sample, remote_share))
    hours = {}
    for s in rank_jobs(jobs, 0.0, batching=False):
        b = s["job"].base.id
        hours[b] = hours.get(b, 0.0) + s["eff"]["labour_hours"]
    return {b: h / sample * arrivals_per_week / utilisation for b, h in hours.items()}
