"""
Write the project's synthetic datasets to analysis/data/ with a data dictionary.

    cd analysis
    python export_datasets.py

Everything is generated from fixed seeds, so the files are identical on every
run. No real tenant, household or NT Government data is used anywhere.

Files written
    data/communities.csv        48 NT communities: location tier, access, trade base, travel
    data/fault_scenarios.csv    the 22 fault scenarios with ground-truth labels
    data/sample_queue_jobs.csv  2,000 synthetic repair jobs, labelled and scored
    data/register_test_set.csv  2,640 test reports: 22 faults x 30 x 4 writing styles
    data/DATA.md                data dictionary, sources, assumptions and summary counts
"""

from pathlib import Path

import numpy as np
import pandas as pd

from fairqueue.engine import Job, score_need
from fairqueue.generator import (
    SCENARIOS, _app_text, label, register_variants, sample_queue, scenario_weights, true_safety,
)
from fairqueue.geo import COMMUNITIES, base_for, round_trip, travel_leg
from fairqueue.parser import parse

DATA = Path(__file__).parent / "data"
TIER_NAME = {"T0": "urban base", "T1": "regional town", "T2": "remote", "T3": "very remote or island"}


# --- 1. Communities: public names and coordinates, plus our travel model ------

def communities_table() -> pd.DataFrame:
    rows = []
    for c in COMMUNITIES:
        base = base_for(c)
        trip = round_trip(travel_leg(base, c, c.access))  # solo round trip from the trade base
        rows.append({
            "community_id": c.id, "community": c.name, "region": c.region,
            "latitude": c.lat, "longitude": c.lon,
            "tier": c.tier, "tier_name": TIER_NAME[c.tier], "remote": c.remote,
            "aria_plus_class": c.aria_plus, "population_approx": c.population,
            "access_mode": c.access, "wet_season_isolation": c.wet_season_isolation,
            "trade_base": base.name,
            "round_trip_km": round(trip["km"], 1),
            "round_trip_hours": round(trip["hours"], 2),
            "round_trip_travel_cost_aud": round(trip["cost"], 2),
        })
    return pd.DataFrame(rows)


# --- 2. Fault scenarios: the ground truth every experiment is scored against --

def scenarios_table() -> pd.DataFrame:
    weights = scenario_weights()
    rows = []
    for i, s in enumerate(SCENARIOS):
        rows.append({
            "scenario_id": i, "fault_category": s["category"],
            "base_safety_level": s["base"],
            "true_safety_level": true_safety(s),          # after the escalation rules
            "urgency_flags": "|".join(s["flags"]),
            "occupant_vulnerability": "|".join(s["vuln"]),
            "sampling_weight": round(float(weights[i]), 4),  # share of jobs in a queue
            "example_app_style": s["app"][0],
            "example_officer_note": s["officer"],
            "example_kriol_influenced_approx": s["kriol"],
        })
    return pd.DataFrame(rows)


# --- 3. A sample queue: what the ranking experiments are run on ---------------

def sample_queue_table(n: int = 2000, seed: int = 2026) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for i, (s, c) in enumerate(sample_queue(rng, n, remote_share=0.5)):
        text = _app_text(s, s["app"][rng.integers(len(s["app"]))], c)
        lab = label(s, c)
        job = Job(f"S{i:05d}", lab, c)
        trip = round_trip(travel_leg(job.base, c, c.access))
        rows.append({
            "job_id": job.id, "report_text": text,
            "scenario_id": SCENARIOS.index(s), "fault_category": lab["category"],
            "true_safety_level": lab["safety_level"],
            "urgency_flags": "|".join(lab["urgency_flags"]),
            "occupant_vulnerability": "|".join(lab["occupant_vulnerability"]),
            "need_score": round(score_need(job), 2),       # location-blind
            "community": c.name, "tier": c.tier, "remote": c.remote,
            "access_mode": c.access, "trade_base": job.base.name,
            "round_trip_km": round(trip["km"], 1),         # logistics: never used by need_score
        })
    return pd.DataFrame(rows)


# --- 4. Register test set: the same faults written four ways -----------------

def register_table() -> pd.DataFrame:
    rng = np.random.default_rng(7)  # same seed as experiment E3
    rows = []
    for i, (register, si, text, truth) in enumerate(register_variants(rng, 30)):
        rows.append({
            "report_id": f"R{i:05d}", "register": register, "scenario_id": si,
            "report_text": text, "true_safety_level": truth,
            "parser_safety_level": parse(text)["safety_level"],
        })
    return pd.DataFrame(rows)


# --- Data dictionary -----------------------------------------------------------

def md_table(df: pd.DataFrame) -> str:
    head = "| " + " | ".join(str(c) for c in df.columns) + " |"
    sep = "|" + "|".join(["---"] * len(df.columns)) + "|"
    body = ["| " + " | ".join(str(v) for v in r) + " |" for r in df.itertuples(index=False)]
    return "\n".join([head, sep, *body])


def write_dictionary(comm, scen, queue, reg):
    tier = comm.groupby(["tier", "tier_name"]).agg(
        communities=("community", "count"),
        median_round_trip_km=("round_trip_km", "median")).reset_index()
    tier["median_round_trip_km"] = tier["median_round_trip_km"].round(0).astype(int)
    safety = (queue.true_safety_level.value_counts(normalize=True).mul(100).round(1)
              .reindex(["critical", "high", "medium", "low"]).rename_axis("true_safety_level")
              .reset_index(name="share_of_jobs_pct"))
    by_remote = (queue.groupby("remote").agg(jobs=("job_id", "count"),
                 median_need_score=("need_score", "median"),
                 median_round_trip_km=("round_trip_km", "median")).round(1).reset_index())
    regs = (reg.assign(correct=reg.true_safety_level == reg.parser_safety_level)
            .groupby("register").agg(reports=("report_id", "count"),
                                     parser_exact_pct=("correct", lambda x: round(100 * x.mean(), 1)))
            .reindex(["app_style", "officer", "sms", "kriol_inf"]).reset_index())

    text = f"""# Fair Queue NT: datasets and data dictionary

All data here is **synthetic**. No real tenant, household or NT Government data was used.
Community names and coordinates are public facts; every fault report is generated.
Regenerate everything with `python export_datasets.py` (fixed seeds, identical output each run).

## Files

| File | Rows | What it is |
|---|---|---|
| `communities.csv` | {len(comm)} | NT communities with remoteness tier, access mode, servicing trade base and modelled travel |
| `fault_scenarios.csv` | {len(scen)} | Fault scenarios with ground-truth safety level, hazards and household vulnerability |
| `sample_queue_jobs.csv` | {len(queue):,} | A sample of the synthetic repair jobs the ranking experiments draw from |
| `register_test_set.csv` | {len(reg):,} | The same faults written in four styles, with the parser's reading of each |

## How the data was made

1. **Communities.** {len(comm)} real NT communities were listed with public coordinates and placed in four
   tiers following the ABS Remoteness Structure (ASGS Edition 3). Each was given an access mode
   (road or air) and the trade base that would service it.
2. **Travel.** Straight-line distance x a detour factor (1.3 road, 1.05 air), fixed speeds and costs per km,
   and a fixed overhead per leg. These are stated assumptions, not routed road distances.
3. **Fault scenarios.** {len(scen)} scenarios across 12 categories. Each has a base safety level, urgency flags
   and household vulnerability. Documented escalation rules give the ground-truth level, for example
   no water with an infant or elderly person present becomes critical.
4. **Jobs.** A job is a scenario placed in a community. Half of all jobs are placed in remote or very
   remote communities, and routine faults are sampled three times as often as critical ones.
5. **Report text.** Written from the scenario, so the true label is known for every report.

## Public sources used to shape the data

- Australian Bureau of Statistics, ASGS Edition 3 Remoteness Structure (remoteness tiers).
- NT Government, Repairs and maintenance fact sheet FS17, 2025 (response targets: urgent 2 business days,
  routine 10, in standard areas; remote areas 5 and 25).

## Field definitions

### communities.csv
| Field | Meaning |
|---|---|
| community_id, community, region | Identifier, name and NT region |
| latitude, longitude | Public coordinates |
| tier, tier_name, remote | T0 urban base, T1 regional town, T2 remote, T3 very remote or island; remote is true for T2 and T3 |
| aria_plus_class | Accessibility class in the style of ARIA+ |
| population_approx | Approximate population, for context only; not used in any score |
| access_mode, wet_season_isolation | Road or air; whether access is commonly cut in the wet season |
| trade_base | Trade base that services the community |
| round_trip_km, round_trip_hours, round_trip_travel_cost_aud | Modelled solo round trip from the trade base |

### fault_scenarios.csv
| Field | Meaning |
|---|---|
| scenario_id, fault_category | Identifier and one of 12 categories |
| base_safety_level, true_safety_level | Level before and after the escalation rules: critical, high, medium or low |
| urgency_flags, occupant_vulnerability | Hazards and household vulnerabilities, separated by a vertical bar |
| sampling_weight | Share of jobs drawn from this scenario |
| example_app_style, example_officer_note, example_kriol_influenced_approx | The same fault in three of the four writing styles |

### sample_queue_jobs.csv
| Field | Meaning |
|---|---|
| job_id, report_text | Identifier and the free-text report |
| scenario_id, fault_category, true_safety_level, urgency_flags, occupant_vulnerability | Ground-truth labels |
| need_score | Location-blind need score: (safety + flags) x vulnerability multiplier |
| community, tier, remote, access_mode, trade_base, round_trip_km | Logistics fields. The need score never reads these |

### register_test_set.csv
| Field | Meaning |
|---|---|
| report_id, scenario_id | Identifiers |
| register | app_style, officer (formal note), sms (informal spelling) or kriol_inf (Kriol-influenced English) |
| report_text | The report as written in that style |
| true_safety_level, parser_safety_level | Ground truth and what the deterministic parser read |

## Summary of what is in the data

Communities by tier:

{md_table(tier)}

Jobs in the sample queue by true safety level:

{md_table(safety)}

Jobs in the sample queue by location. Need is similar by design; distance is not:

{md_table(by_remote)}

Register test set, with the share of reports whose safety level the parser read exactly right:

{md_table(regs)}

## Limits and cautions

- Synthetic data shows how the design behaves. It does not show accuracy on real NT repair reports.
- The Kriol-influenced reports were drafted with AI assistance by a team with no Kriol speakers. They are
  rough approximations for stress testing only, are not authentic Kriol, and must be replaced by
  examples written or checked by Kriol speakers before any real evaluation.
- Report text for the app style shares vocabulary with the parser, so parser accuracy on that style is
  optimistic. The other three styles exist to expose this.
- Any real deployment would need data governed with the communities concerned (CARE principles).
"""
    (DATA / "DATA.md").write_text(text, encoding="utf-8")


def main():
    DATA.mkdir(exist_ok=True)
    comm, scen, queue, reg = communities_table(), scenarios_table(), sample_queue_table(), register_table()

    # Integrity checks: fail loudly rather than publish a broken dataset.
    assert len(comm) == 48 and comm.community_id.is_unique
    assert len(scen) == 22 and abs(scen.sampling_weight.sum() - 1) < 0.01
    assert queue.job_id.is_unique and reg.report_id.is_unique
    assert not queue[["report_text", "true_safety_level", "community"]].isna().any().any()
    # The same fault has the same need score wherever it is: one value per scenario.
    assert (queue.groupby("scenario_id").need_score.nunique() == 1).all()
    assert set(reg.register) == {"app_style", "officer", "sms", "kriol_inf"}
    assert (reg.groupby("register").size() == 660).all()
    comm.to_csv(DATA / "communities.csv", index=False)
    scen.to_csv(DATA / "fault_scenarios.csv", index=False)
    queue.to_csv(DATA / "sample_queue_jobs.csv", index=False)
    reg.to_csv(DATA / "register_test_set.csv", index=False)
    write_dictionary(comm, scen, queue, reg)
    for name, df in (("communities", comm), ("fault_scenarios", scen),
                     ("sample_queue_jobs", queue), ("register_test_set", reg)):
        print(f"{name:20s} {len(df):6,d} rows")


if __name__ == "__main__":
    main()
