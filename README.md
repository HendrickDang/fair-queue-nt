# Fair Queue NT

**Housing maintenance triage for remote Northern Territory communities that ranks repairs by tenant need, never by travel cost, and makes the cost trade-off a visible decision a person owns.**

CDU IT Code Fair 2026, AI Challenge, Brief 1: *How might we help a housing maintenance coordinator prioritise urgent repairs across remote NT communities without "efficiency" quietly pushing remote tenants to the back of the queue?*

> **All data in this repository is synthetic.** No real tenant, household or NT Government data was used. Community names and coordinates are public; every fault report is generated.

## The idea

Distance decides the route, not the queue.

1. **Need rank** reads only the report (safety level, hazards, who lives in the house). Location cannot change it: a test moves every job to all 48 communities and checks its score never changes.
2. **Efficiency rank** reads travel distance, time and cost, with **batching** so jobs in nearby communities share one trip.
3. **The dial** (λ, 0 = need only, 1 = travel cost only) is set by the coordinator, shows what it does to remote waits, and is **committed and audited** as a human decision.
4. **The tenant answer** says what was understood, how urgent it was rated, what is ahead and why, who decided, when the target will be missed, what would move it up, and how to ask a person to review it.

## What is in this repository

| Folder | What it is |
|---|---|
| `analysis/` | **Python** (the submission's source code): a commented port of the triage engine plus the four experiments behind the report's findings. |
| `analysis/data/` | **The datasets** as CSV files, with a data dictionary (`DATA.md`): 48 communities, 22 fault scenarios, 2,000 sample jobs and 2,640 test reports. All synthetic. |
| `nt-housing-triage/` | The working web app (Next.js + TypeScript): coordinator dashboard, equity dial, tenant answer page, SQLite audit trail, optional fine-tuned Gemma parser. |
| `docs/` | The script that builds the report (`docs/report/`), app screenshots (`docs/screenshots/`), and the slide-sized charts with the script that draws them (`docs/presentation/`). |

The Python and TypeScript engines are tested against each other: `analysis/tests/test_engine.py` checks that both produce identical parses, scores and ranks on 74 reports and 44 ranked runs (two queues, 11 dial values, batching on and off).

## Reproduce the results (Python)

Requires Python 3.10+ and the community data in `nt-housing-triage/data/` (already in the repository).

```bash
git clone https://github.com/HendrickDang/fair-queue-nt.git
cd fair-queue-nt/analysis
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

python -m pytest -q          # 79 tests: parity with the web app + location invariance
python run_experiments.py    # about 20 seconds; writes results/ and figures/
python run_experiments.py --uniform   # optional sensitivity check
python export_datasets.py   # rewrites analysis/data/ (identical output each run)
```

Every number in the report is in `analysis/results/summary.json`. All randomness is seeded, so the output is identical on every run.

| Experiment | Question | Headline (batching on) |
|---|---|---|
| E1 The dial | Who waits when travel cost is weighted? | Urgent remote jobs: 2.9 days at λ=0, 7.2 days at λ=1. Total travel cost: unchanged. |
| E2 Batching | What does grouping trips do? | 30% less travel cost; remote median wait 8.1 → 6.1 days at λ=0. |
| E3 Parser robustness | Whose reports get misread? | Urgent reports read as routine: 11% (app phrasing) to 86% (Kriol-influenced). A fail-safe cuts this to under 8%. |
| E4 Ageing | Do some jobs wait forever? | Without ageing, some jobs are still waiting when the simulation ends; ageing roughly halves the worst wait, at some cost to average town waits. |

## Run the web app

Requires Node.js 22.5 or newer.

```bash
cd fair-queue-nt/nt-housing-triage
npm ci
npm test        # 62 tests
npm run dev     # then open http://localhost:3000
```

On Windows you can instead double-click `nt-housing-triage/start-server.bat`, which starts the app and opens a temporary public link:

1. **First time only:** if it says `cloudflared was not found`, run `winget install Cloudflare.cloudflared`, then close the Command Prompt window, open a new one, and run `start-server.bat` again.
2. Wait several seconds until a new browser tab opens with the public address.
3. If the tab says "This site can't be reached", wait several seconds for the public address to come up, then click Reload.

Keep the two windows it opens running while you use the link. Details are in `nt-housing-triage/README.md`.

The app runs fully offline with the deterministic parser; no model or environment file is needed. The coordinator dashboard is at `/` and the tenant answer at `/tenant`. See `nt-housing-triage/README.md` for the optional local language model.

## Limitations

Synthetic data shows the mechanism works, not that it works on real NT reports. Travel uses straight-line distance with a detour factor, not a road network. The Kriol-influenced test reports were written by non-speakers as rough approximations and must be replaced by examples from Kriol speakers before any real evaluation. See the report's Discussion section.

## Team

**Last Bar** (registration AIC008), CDU IT Code Fair 2026 AI Challenge.

| Member | Role |
|---|---|
| Le Nhat Minh (Thomas) Tran | Web app and ranking engine |
| Van Hoi (Hendrick) Dang | Python analysis, experiments and report |
| Minh Hoang Bui | Presentation and data checks |
| Ngoc Ngan Le | Presentation and test scenarios |

AI assistance was used in this project and is declared in the report appendix.

MIT licence.
