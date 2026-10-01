"""
Run every experiment in the report and write results, tables and figures.

    cd analysis
    python run_experiments.py            # about 30 seconds
    python run_experiments.py --uniform  # sensitivity: all fault types equally likely

Outputs (all reproducible from fixed seeds):
    results/summary.json        every number quoted in the report
    results/e1_dial_sweep.csv   E1 per-queue outcomes at each dial setting
    results/e3_registers.csv    E3 parser output for every test report
    figures/fig1_dial.png       E1 chart
    figures/fig2_parser.png     E3 chart

Experiments
    E1  The equity dial. 300 simulated queues of 40 jobs (half remote). For each
        dial setting lambda in 0..1, who waits how long?
    E2  Batching. The same queues with batching switched off.
    E3  Parser robustness. The same 22 faults written in four registers. How
        often is an urgent report read as routine, and does a fail-safe help?
    E4  Ageing. A 60-week simulation with weekly arrivals: does adding priority
        for time waited cap the longest waits?
"""

import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from fairqueue.engine import rank_jobs  # noqa: E402
from fairqueue.generator import register_variants, sample_queue  # noqa: E402
from fairqueue.parser import fail_safe, parse  # noqa: E402
from fairqueue.simulate import (  # noqa: E402
    base_capacity, make_jobs, snapshot_metrics, weekly_simulation,
)
from fairqueue.taxonomy import SAFETY_ORDER  # noqa: E402

HERE = Path(__file__).parent
RESULTS, FIGURES = HERE / "results", HERE / "figures"
LAMBDAS = np.round(np.linspace(0, 1, 11), 2)

# Chart styling: blue = town/regional, orange = remote (validated palette slots 1-2).
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def style(ax):
    """Recessive axes: solid hairline grid, no top/right spines."""
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=8)


# ---------------------------------------------------------------------------
# E1 + E2: the dial, with and without batching
# ---------------------------------------------------------------------------

def run_dial(uniform: bool, reps=300, n_jobs=40):
    rows = []
    for rep in range(reps):
        rng = np.random.default_rng(1000 + rep)                 # one seed per queue
        jobs = make_jobs(sample_queue(rng, n_jobs, 0.5, uniform))
        for batching in (True, False):
            for lam in LAMBDAS:
                for r in snapshot_metrics(rank_jobs(jobs, lam, batching)):
                    r.update(rep=rep, lam=lam, batching=batching)
                    rows.append(r)
    return pd.DataFrame(rows)


def summarise_dial(d: pd.DataFrame) -> dict:
    out = {}
    for batching in (True, False):
        b = d[d.batching == batching]
        key = "batching" if batching else "no_batching"
        out[key] = {}
        for lam in (0.0, 0.5, 1.0):
            x = b[b.lam == lam]
            town, remote = x[~x.remote], x[x.remote]
            per_queue = x.groupby("rep")
            out[key][str(lam)] = {
                "median_days_town": round(town.days.median(), 2),
                "median_days_remote": round(remote.days.median(), 2),
                "median_days_urgent_town": round(town[town.urgent].days.median(), 2),
                "median_days_urgent_remote": round(remote[remote.urgent].days.median(), 2),
                "pct_late_town": round(100 * town.late.mean(), 1),
                "pct_late_remote": round(100 * remote.late.mean(), 1),
                "pct_urgent_late_remote": round(100 * remote[remote.urgent].late.mean(), 1),
                "pct_urgent_late_town": round(100 * town[town.urgent].late.mean(), 1),
                # Jobs finished in the first 5 working days: what "efficiency" buys.
                "jobs_done_5_days_per_queue": round(per_queue.apply(lambda q: (q.days <= 5).sum()).mean(), 1),
                # Need-weighted average wait: harm carried while jobs wait.
                "need_weighted_days": round((x.need * x.days).sum() / x.need.sum(), 2),
                # Total travel cost per queue. The dial reorders work; it does not change it.
                "travel_cost_per_queue": round(per_queue.travel_cost.sum().mean(), 0),
            }
    return out


def fig_dial(d: pd.DataFrame, path: Path):
    b = d[d.batching]
    fig, axes = plt.subplots(1, 2, figsize=(7.2, 2.9), dpi=300)
    panels = [("All jobs", b), ("Urgent jobs (critical or high)", b[b.urgent])]
    for ax, (title, x) in zip(axes, panels):
        g = x.groupby(["lam", "remote"]).days.median().unstack()
        for remote, color, name in ((False, BLUE, "Town and regional"), (True, ORANGE, "Remote")):
            ax.plot(g.index, g[remote], color=color, linewidth=2, marker="o", markersize=3.5, label=name)
            ax.annotate(f"{g[remote].iloc[-1]:.1f}", (1, g[remote].iloc[-1]), xytext=(5, 0),
                        textcoords="offset points", va="center", fontsize=8, color=INK)
            ax.annotate(f"{g[remote].iloc[0]:.1f}", (0, g[remote].iloc[0]), xytext=(-5, 0),
                        textcoords="offset points", va="center", ha="right", fontsize=8, color=INK)
        ax.set_title(title, fontsize=9, color=INK, loc="left")
        ax.set_xlabel("Dial (0 = need only, 1 = travel cost only)", fontsize=8, color=MUTED)
        ax.set_xlim(-0.12, 1.12)
        ax.set_ylim(0, None)
        style(ax)
    axes[0].set_ylabel("Median working days until done", fontsize=8, color=MUTED)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, frameon=False, fontsize=8, loc="upper center",
               ncol=2, bbox_to_anchor=(0.5, 1.06))
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# E3: parser robustness by register
# ---------------------------------------------------------------------------

REGISTER_NAMES = {
    "app_style": "App's own phrasing",
    "officer": "Formal officer note",
    "sms": "Informal / SMS spelling",
    "kriol_inf": "Kriol-influenced (approx.)",
}


def run_registers(per_scenario=30):
    rng = np.random.default_rng(7)
    rows = []
    for register, si, text, truth in register_variants(rng, per_scenario):
        p = parse(text)
        f = fail_safe(p)
        rows.append({
            "register": register, "scenario": si, "text": text, "truth": truth,
            "pred": p["safety_level"], "pred_fail_safe": f["safety_level"],
            "needs_human_check": f["needs_human_check"],
        })
    d = pd.DataFrame(rows)
    lvl = {s: i for i, s in enumerate(SAFETY_ORDER)}
    d["urgent"] = d.truth.isin(["critical", "high"])
    d["exact"] = d.pred == d.truth
    d["under"] = d.pred.map(lvl) < d.truth.map(lvl)
    d["dropped"] = d.urgent & d.pred.isin(["medium", "low"])            # urgent read as routine
    d["dropped_fs"] = d.urgent & d.pred_fail_safe.isin(["medium", "low"])
    return d


def summarise_registers(d: pd.DataFrame) -> dict:
    out = {}
    for reg in REGISTER_NAMES:
        x = d[d.register == reg]
        u = x[x.urgent]
        out[reg] = {
            "n": int(len(x)),
            "pct_exact": round(100 * x.exact.mean(), 1),
            "pct_under_triaged": round(100 * x.under.mean(), 1),
            "pct_urgent_read_as_routine": round(100 * u.dropped.mean(), 1),
            "pct_urgent_read_as_routine_with_fail_safe": round(100 * u.dropped_fs.mean(), 1),
            "pct_sent_to_human_check": round(100 * x.needs_human_check.mean(), 1),
        }
    return out


def fig_parser(summary: dict, path: Path):
    regs = list(REGISTER_NAMES)[::-1]
    before = [summary[r]["pct_urgent_read_as_routine"] for r in regs]
    after = [summary[r]["pct_urgent_read_as_routine_with_fail_safe"] for r in regs]
    y = np.arange(len(regs))
    h = 0.36
    fig, ax = plt.subplots(figsize=(7.2, 2.5), dpi=300)
    ax.barh(y + h / 2, before, height=h - 0.04, color=BLUE, label="Parser alone")
    ax.barh(y - h / 2, after, height=h - 0.04, color=AQUA, label="With fail-safe (unread reports go to a person)")
    for yi, b, a in zip(y, before, after):
        ax.text(b + 1, yi + h / 2, f"{b:.0f}%", va="center", fontsize=8, color=INK)
        ax.text(a + 1, yi - h / 2, f"{a:.0f}%", va="center", fontsize=8, color=INK)
    ax.set_yticks(y, [REGISTER_NAMES[r] for r in regs], fontsize=8, color=INK)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Urgent reports read as routine (%)", fontsize=8, color=MUTED)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=8)
    ax.legend(frameon=False, fontsize=8, loc="lower center", ncol=2, bbox_to_anchor=(0.4, 1.0))
    fig.tight_layout()
    fig.savefig(path, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------------
# E4: ageing over a year of weekly arrivals
# ---------------------------------------------------------------------------

def run_ageing(seeds=6):
    # Capacity set so demand equals capacity on solo (unbatched) trips.
    cap = base_capacity(np.random.default_rng(99), 30, utilisation=1.0)
    out = {}
    for lam in (0.0, 0.3, 0.6):
        for ageing in (0, 6):
            rows = []
            for seed in range(seeds):
                rows += weekly_simulation(np.random.default_rng(seed), lam, weeks=60,
                                          capacity=cap, ageing=ageing)
            d = pd.DataFrame(rows)
            res = {}
            for name, g in (("town", d[~d.remote]), ("remote", d[d.remote])):
                res[name] = {
                    "mean_wait_weeks": round(g.wait_weeks.mean(), 2),
                    "max_wait_weeks": int(g.wait_weeks.max()),
                    "pct_waiting_over_8_weeks": round(100 * (g.wait_weeks > 8).mean(), 1),
                }
            out[f"lambda={lam},ageing={ageing}"] = res
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--uniform", action="store_true", help="all fault scenarios equally likely")
    args = ap.parse_args()
    RESULTS.mkdir(exist_ok=True)
    FIGURES.mkdir(exist_ok=True)
    tag = "_uniform" if args.uniform else ""

    print("E1/E2  dial sweep ...")
    dial = run_dial(args.uniform)
    dial.to_csv(RESULTS / f"e1_dial_sweep{tag}.csv.gz", index=False)
    summary = {"E1_E2_dial": summarise_dial(dial)}
    if not args.uniform:
        fig_dial(dial, FIGURES / "fig1_dial.png")

        print("E3     parser robustness ...")
        reg = run_registers()
        reg.to_csv(RESULTS / "e3_registers.csv", index=False)
        summary["E3_registers"] = summarise_registers(reg)
        fig_parser(summary["E3_registers"], FIGURES / "fig2_parser.png")

        print("E4     ageing ...")
        summary["E4_ageing"] = run_ageing()

    (RESULTS / f"summary{tag}.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
