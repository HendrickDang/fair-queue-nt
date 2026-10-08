"""
Tests for the Python engine.

1. Parity: the Python port parses, scores and ranks exactly like the
   TypeScript engine in the web app (reference/ts_reference.json is exported
   by `npm run reference:export` in nt-housing-triage/).
2. Location invariance: moving a job to any other community never changes
   its need score. This is the core fairness claim, checked by code.

Run from analysis/:  python -m pytest -q
"""
import json
from pathlib import Path

import pytest

from fairqueue.engine import Job, rank_jobs, score_need
from fairqueue.geo import COMMUNITIES, match_community
from fairqueue.parser import parse
from fairqueue.taxonomy import AGEING_CAP, AGEING_POINTS_PER_DAY

REF = json.loads((Path(__file__).parents[1] / "reference" / "ts_reference.json").read_text())


def _jobs(inputs, held=False):
    """held=True marks every report with no recognised hazard as not yet read
    by a person (the fail-safe hold), as export-reference.ts does."""
    jobs = []
    for i in inputs:
        report = parse(i["rawText"])
        c = match_community(i["rawText"])
        if c:
            jobs.append(Job(i["id"], report, c, i["reportedAt"],
                            needs_reading=held and not report["urgency_flags"]))
    return jobs


@pytest.mark.parametrize("ref", REF["parses"], ids=lambda r: r["text"][:40])
def test_parser_matches_typescript(ref):
    p = parse(ref["text"])
    for key in ("category", "safety_level", "urgency_flags", "occupant_vulnerability",
                "trade_required", "community"):
        assert p[key] == ref[key], key


@pytest.mark.parametrize("queue", ["seed", "generated", "held"])
def test_ranking_matches_typescript(queue):
    jobs = _jobs(REF[queue]["inputs"], held=(queue == "held"))
    for run in REF[queue]["runs"]:
        ours = rank_jobs(jobs, run["lambda"], run["batching"],
                         ageing=REF["ageing"], now=REF["now"])
        theirs = run["ranked"]
        assert [s["job"].id for s in ours] == [t["id"] for t in theirs], (run["lambda"], run["batching"])
        for s, t in zip(ours, theirs):
            assert s["need"] == pytest.approx(t["needScore"])
            assert s["eff"]["score"] == pytest.approx(t["efficiencyScore"])
            assert s["need_rank"] == t["needRank"]
            assert s["efficiency_rank"] == t["efficiencyRank"]
            assert s["start_days"] == pytest.approx(t["estimatedStartDays"])


def test_need_score_ignores_location():
    jobs = _jobs(REF["generated"]["inputs"])
    for j in jobs:
        before = score_need(j)
        for c in COMMUNITIES:  # move the same report to every community in the NT
            assert score_need(Job(j.id, j.report, c, j.reported_at)) == before


def test_ageing_raises_priority_for_older_reports():
    """Waiting time adds need points, so a newer equal report cannot jump ahead."""
    now = "2026-10-01T00:00:00+09:30"
    c = match_community("Darwin")
    older = Job("OLD", parse("tap leaking under the sink, Darwin"), c, "2026-09-01T00:00:00+09:30")
    newer = Job("NEW", parse("tap leaking under the sink, Darwin"), c, "2026-09-30T00:00:00+09:30")

    off = rank_jobs([older, newer], 0.0)
    assert all(s["age_points"] == 0 for s in off)

    on = rank_jobs([older, newer], 0.0, ageing=AGEING_POINTS_PER_DAY, now=now)
    by_id = {s["job"].id: s for s in on}
    assert by_id["OLD"]["age_points"] > by_id["NEW"]["age_points"] > 0


def test_ageing_is_capped_so_safety_still_dominates():
    now = "2026-10-01T00:00:00+09:30"
    c = match_community("Darwin")
    urgent = Job("U", parse("sparks coming out of the powerpoint, Darwin"), c, "2026-09-30T00:00:00+09:30")
    routine = Job("R", parse("tap leaking under the sink, Darwin"), c, "2020-01-01T00:00:00+09:30")

    ranked = rank_jobs([urgent, routine], 0.0, ageing=AGEING_POINTS_PER_DAY, now=now)
    by_id = {s["job"].id: s for s in ranked}
    assert by_id["R"]["age_points"] == AGEING_CAP
    assert ranked[0]["job"].id == "U"  # a fresh critical report still wins


def test_hold_keeps_an_unread_report_at_high_priority():
    """The fail-safe hold: a report with no recognised hazard scores as 'high'
    until a person reads it, and goes back to its parsed score afterwards."""
    c = COMMUNITIES[0]
    report = parse("pawa point im sparkin, smok kamat longa Wadeye")
    assert report["urgency_flags"] == []
    unread = Job("U", report, c, needs_reading=True)
    read = Job("R", report, c, needs_reading=False)
    plain_high = Job("H", {**report, "safety_level": "high"}, c)
    assert score_need(unread) == score_need(plain_high)
    assert score_need(read) < score_need(unread)


def test_hold_never_lowers_a_score_and_ignores_location():
    jobs = _jobs(REF["generated"]["inputs"])
    for j in jobs:
        held = Job(j.id, j.report, j.community, j.reported_at, needs_reading=True)
        assert score_need(held) >= score_need(j)
        for c in COMMUNITIES[:8]:
            assert score_need(Job(j.id, j.report, c, j.reported_at, needs_reading=True)) == score_need(held)
