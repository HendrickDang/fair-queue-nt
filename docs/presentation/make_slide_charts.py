"""Slide-sized versions of the two report charts.

Same data and colours as analysis/run_experiments.py, redrawn with larger type so
they can be read from the back of a room. Run after run_experiments.py:

    python docs/presentation/make_slide_charts.py

Reads analysis/results/ and writes slide_dial.png and slide_parser.png next to this file.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.font_manager  # noqa: F401
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

HERE = Path(__file__).parent
RESULTS = HERE.parent.parent / "analysis" / "results"

# Same palette as the report figures: blue = town/regional, orange = remote.
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#16202a", "#3c4650", "#e4e3df"
REGISTERS = {  # same order and labels as the report figure
    "app_style": "App's own phrasing",
    "officer": "Formal officer note",
    "sms": "Informal / SMS spelling",
    "kriol_inf": "Kriol-influenced (approx.)",
}
# Use the deck's body font if it is installed, otherwise the nearest match.
_installed = {f.name for f in matplotlib.font_manager.fontManager.ttflist}
plt.rcParams["font.family"] = next(f for f in ("Calibri", "Carlito", "Arial", "DejaVu Sans") if f in _installed)
BASE = 15  # base type size in points at slide scale


def style(ax, grid_axis="y"):
    ax.grid(axis=grid_axis, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=BASE - 2, length=0)


def dial(path):
    d = pd.read_csv(RESULTS / "e1_dial_sweep.csv.gz")
    b = d[d.batching]
    fig, axes = plt.subplots(1, 2, figsize=(7.5, 4.5), dpi=220, sharey=True)
    for ax, (title, x) in zip(axes, [("All jobs", b), ("Urgent jobs", b[b.urgent])]):
        g = x.groupby(["lam", "remote"]).days.median().unstack()
        for remote, color, name in ((False, BLUE, "Town"), (True, ORANGE, "Remote")):
            ax.plot(g.index, g[remote], color=color, linewidth=3, marker="o", markersize=5, label=name)
            # label both ends of each line with its value
            ax.annotate(f"{g[remote].iloc[0]:.1f}", (0, g[remote].iloc[0]), xytext=(-7, 0),
                        textcoords="offset points", va="center", ha="right", fontsize=BASE, color=INK)
            ax.annotate(f"{g[remote].iloc[-1]:.1f}", (1, g[remote].iloc[-1]), xytext=(7, 0),
                        textcoords="offset points", va="center", fontsize=BASE, color=INK, fontweight="bold")
        ax.set_title(title, fontsize=BASE + 2, color=INK, loc="left", fontweight="bold", pad=10)
        ax.set_xlim(-0.2, 1.2)
        ax.set_ylim(0, 8)
        ax.set_xticks([0, 0.5, 1], ["need only", "", "cost only"])
        style(ax)
    axes[0].set_ylabel("Median working days until done", fontsize=BASE - 1, color=MUTED)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, ["Town and regional", "Remote"], frameon=False, fontsize=BASE, loc="upper center",
               ncol=2, bbox_to_anchor=(0.5, 1.0))
    fig.supxlabel("Where the coordinator sets the dial", fontsize=BASE - 1, color=MUTED)
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(path, facecolor="white")
    plt.close(fig)


def parser(path):
    s = json.loads((RESULTS / "summary.json").read_text())["E3_registers"]
    regs = list(REGISTERS)[::-1]
    before = [s[r]["pct_urgent_read_as_routine"] for r in regs]
    after = [s[r]["pct_urgent_read_as_routine_with_fail_safe"] for r in regs]
    y, h = np.arange(len(regs)), 0.38
    fig, ax = plt.subplots(figsize=(7.3, 4.0), dpi=220)
    ax.barh(y + h / 2, before, height=h - 0.05, color=BLUE, label="Parser alone")
    ax.barh(y - h / 2, after, height=h - 0.05, color=AQUA, label="With fail-safe")
    for yi, bv, av in zip(y, before, after):
        ax.text(bv + 1.5, yi + h / 2, f"{bv:.0f}%", va="center", fontsize=BASE, color=INK, fontweight="bold")
        ax.text(av + 1.5, yi - h / 2, f"{av:.0f}%", va="center", fontsize=BASE - 1, color=INK)
    ax.set_yticks(y, [REGISTERS[r] for r in regs], fontsize=BASE, color=INK)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Urgent reports read as routine (%)", fontsize=BASE - 1, color=MUTED)
    style(ax, grid_axis="x")
    ax.legend(frameon=False, fontsize=BASE, loc="lower center", ncol=2, bbox_to_anchor=(0.35, 1.0))
    fig.tight_layout()
    fig.savefig(path, facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    dial(HERE / "slide_dial.png")
    parser(HERE / "slide_parser.png")
    print("wrote slide_dial.png and slide_parser.png")
