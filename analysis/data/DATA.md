# Fair Queue NT: datasets and data dictionary

All data here is **synthetic**. No real tenant, household or NT Government data was used.
Community names and coordinates are public facts; every fault report is generated.
Regenerate everything with `python export_datasets.py` (fixed seeds, identical output each run).

## Files

| File | Rows | What it is |
|---|---|---|
| `communities.csv` | 48 | NT communities with remoteness tier, access mode, servicing trade base and modelled travel |
| `fault_scenarios.csv` | 22 | Fault scenarios with ground-truth safety level, hazards and household vulnerability |
| `sample_queue_jobs.csv` | 2,000 | A sample of the synthetic repair jobs the ranking experiments draw from |
| `register_test_set.csv` | 2,640 | The same faults written in four styles, with the parser's reading of each |

## How the data was made

1. **Communities.** 48 real NT communities were listed with public coordinates and placed in four
   tiers following the ABS Remoteness Structure (ASGS Edition 3). Each was given an access mode
   (road or air) and the trade base that would service it.
2. **Travel.** Straight-line distance x a detour factor (1.3 road, 1.05 air), fixed speeds and costs per km,
   and a fixed overhead per leg. These are stated assumptions, not routed road distances.
3. **Fault scenarios.** 22 scenarios across 12 categories. Each has a base safety level, urgency flags
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

| tier | tier_name | communities | median_round_trip_km |
|---|---|---|---|
| T0 | urban base | 3 | 0 |
| T1 | regional town | 10 | 229 |
| T2 | remote | 12 | 581 |
| T3 | very remote or island | 23 | 945 |

Jobs in the sample queue by true safety level:

| true_safety_level | share_of_jobs_pct |
|---|---|
| critical | 22.8 |
| high | 18.2 |
| medium | 43.1 |
| low | 16.0 |

Jobs in the sample queue by location. Need is similar by design; distance is not:

| remote | jobs | median_need_score | median_round_trip_km |
|---|---|---|---|
| False | 990 | 29.0 | 173.2 |
| True | 1010 | 29.0 | 694.3 |

Register test set, with the share of reports whose safety level the parser read exactly right:

| register | reports | parser_exact_pct |
|---|---|---|
| app_style | 660 | 88.6 |
| officer | 660 | 72.7 |
| sms | 660 | 60.0 |
| kriol_inf | 660 | 31.8 |

## Limits and cautions

- Synthetic data shows how the design behaves. It does not show accuracy on real NT repair reports.
- The Kriol-influenced reports were drafted with AI assistance by a team with no Kriol speakers. They are
  rough approximations for stress testing only, are not authentic Kriol, and must be replaced by
  examples written or checked by Kriol speakers before any real evaluation.
- Report text for the app style shares vocabulary with the parser, so parser accuracy on that style is
  optimistic. The other three styles exist to expose this.
- Any real deployment would need data governed with the communities concerned (CARE principles).
