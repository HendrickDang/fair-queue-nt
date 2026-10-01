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

REF = json.loads((Path(__file__).parents[1] / "reference" / "ts_reference.json").read_text())


def _jobs(inputs):
    jobs = []
    for i in inputs:
        report = parse(i["rawText"])
        c = match_community(i["rawText"])
        if c:
            jobs.append(Job(i["id"], report, c, i["reportedAt"]))
    return jobs


@pytest.mark.parametrize("ref", REF["parses"], ids=lambda r: r["text"][:40])
def test_parser_matches_typescript(ref):
    p = parse(ref["text"])
    for key in ("category", "safety_level", "urgency_flags", "occupant_vulnerability",
                "trade_required", "community"):
        assert p[key] == ref[key], key


@pytest.mark.parametrize("queue", ["seed", "generated"])
def test_ranking_matches_typescript(queue):
    jobs = _jobs(REF[queue]["inputs"])
    for run in REF[queue]["runs"]:
        ours = rank_jobs(jobs, run["lambda"], run["batching"])
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
