# NT Housing Maintenance Triage

GovHack NT 2026 — a working web app that helps a housing maintenance coordinator
prioritise urgent repairs across remote Northern Territory communities **without
"efficiency" quietly pushing remote tenants to the back of the queue**.

> **How might we** help a coordinator prioritise urgent repairs across remote NT
> communities without efficiency quietly pushing remote tenants to the back of the queue?

## The idea

Two independent ranks, and the tension between them made visible:

- **Need rank** — location-blind, human-centric: `safety × occupant vulnerability`.
- **Efficiency rank** — logistics: travel distance + job duration − batching bonus.
- **Equity gap** = `efficiency rank − need rank`. Remote jobs get a big positive gap.

The dashboard shows the gap and its driver, e.g. *"Wadeye roof leak is #2 on need,
#9 after logistics — 1,140 km round trip. Batch with the 2 other West Daly jobs →
recovers places at ~zero extra cost."*

Reconciliation is **batching**, not sacrifice. Where equity and efficiency genuinely
conflict, an **equity dial** (`λ = 0` pure fair → `1` pure efficient) re-ranks live
and reports the human cost: *"saves $X travel, adds +N median days for remote
households."* The human commits, and the decision is **audited**.

A tenant can ask *why* their repair was deprioritised and get a real answer built
from the same scores the coordinator sees.

## Stack

- **Next.js (App Router) + Tailwind CSS** — single `npm run dev`, minimal deps.
- **Deterministic engine** in TypeScript — never a black box.
- **Fine-tuned parser** — Gemma 4 E2B via local **Ollama** (Q4_K_M GGUF), with a
  deterministic keyword fallback so the app works fully offline with no model.
- **Grounded explainer** — every sentence is built from numbers already in the
  engine, so a fairness explanation can never hallucinate a figure.
- **SQLite persistence** — reports, committed schedules and the audit trail live
  in a local file (`data/nt-triage.sqlite`) via Node's built-in `node:sqlite`.
  No server, no cloud — consistent with the offline, on-country promise.

## Run the app from a clone

### Prerequisites

- Git
- Node.js **22.5 or newer** and npm

The app uses Node's built-in `node:sqlite`; you do not need to install or run a
separate database server.

### Install and start

Clone the repository, then install and run the housing-triage app from its
directory (the repository root contains other projects too). Replace
`<repository-url>` with the clone URL shown on the repository page:

```bash
git clone <repository-url> nt-warning-blackspot-index
cd nt-warning-blackspot-index/nt-housing-triage
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Stop the development server
with `Ctrl+C` in the terminal.

No environment file or model is required for the demo. On first use, the app
creates and seeds its local SQLite database at `data/nt-triage.sqlite`. The
deterministic parser works without a network connection or Ollama. To enable the
optional local model parser, follow `training/README.md` and configure the values
from `.env.example` in a local `.env` file.

### Common commands

Run these from `nt-housing-triage/`:

```bash
npm test                 # run the test suite
npm run build            # create a production build
npm run start            # serve the production build
npm run data:generate    # regenerate data/distance-matrix.json
npm run db:reset         # delete the local database; it is reseeded on next run
npm run training:generate -- 3000   # build the fine-tuning dataset
```

## Layout

```
nt-housing-triage/
├── app/                     # Next.js App Router
│   ├── page.tsx             # coordinator dashboard
│   ├── tenant/page.tsx      # tenant answer view
│   ├── components/          # dashboard, queue, map, equity dial, audit
│   └── api/parse/route.ts   # model-first parse endpoint (Ollama + fallback)
├── lib/
│   ├── taxonomy.ts          # enums, trigger phrases, weights (shared contract)
│   ├── engine/              # need score, batching, efficiency, equity ranking
│   ├── parser/              # LLM-first parser + deterministic fallback
│   ├── explainer/           # deterministic, grounded explanations
│   ├── db/                  # SQLite schema + repository (reports, schedules, audit)
│   ├── data/                # communities, distances, generator, seed
│   └── ui/                  # shared UI colour tokens
├── data/                    # communities.json, distance matrix, nt-triage.sqlite
├── scripts/                 # data artifact generation
├── training/                # dataset generation + fine-tune recipe
└── tests/                   # engine, parser golden set, generator
```

## Data & methodology

- **Communities**: real NT community locations with ARIA+ remoteness classes and
  curated remoteness tiers (T0 urban base → T3 very remote / island).
- **Distances**: derived from real coordinates with a documented detour factor per
  access mode (road/barge/air). Illustrative, not a routed road network — see
  `lib/data/distances.ts`. Swap in a real routing matrix without touching the engine.
- **Reports**: synthetic, generated from the shared taxonomy so the demo scenario
  stages reproducibly. The same generator produces the fine-tune dataset.

## Persistence (SQLite)

Everything that must survive a reload lives in `data/nt-triage.sqlite`
(gitignored, created on first run). `npm run db:reset` wipes it; the demo queue
reseeds itself on the next run using the deterministic parser.

| table | holds |
|---|---|
| `reports` | report text, parsed fields, and the engine's need / efficiency / equity-gap ranks |
| `schedules` | a committed schedule at a given equity dial (λ) plus its grounded narrative |
| `schedule_jobs` | the ordered jobs in a schedule, each with a rationale |
| `audit_log` | append-only record of commits and escalations (who, what, why) |

The audit trail is the durable half of the trust twist: a commit (`POST /api/commit`)
and a tenant's escalation (`POST /api/escalate`) are both written down — so the
"why" a tenant is given is the same record the coordinator signed off on.

## Demo scenario

1. Darwin tap leak and an Alice Springs aircon fault sort to the top on efficiency.
2. A **Wadeye roof caving over a bedroom with young children** is critical on need
   but drops far down the efficiency-only sort.
3. Turn on batching → Wadeye groups with the two other West Daly jobs and recovers
   places at almost no extra travel cost.
4. Read the tenant's answer aloud — it is honest about the trade-off.
5. Commit the schedule and record an escalation — both land in `audit_log`.
