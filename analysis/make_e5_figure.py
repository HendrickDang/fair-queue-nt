"""
E5: draw the keyword parser against the fine-tuned language model, by writing style.

Reads results/e5_model_registers.json, which eval_model_registers.py writes after
running a model through Ollama over the 2,640 register test reports, and draws
figures/fig3_model.png. If results/e5_model_rows.csv is there too, it also works
out what happens when both readers are used and the more urgent reading wins,
and writes results/e5_two_readers.json. Needs no model and no network.

    python make_e5_figure.py
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
SOURCE = HERE / "results" / "e5_model_registers.json"
TARGET = HERE / "figures" / "fig3_model.png"
ROWS = HERE / "results" / "e5_model_rows.csv"
TWO = HERE / "results" / "e5_two_readers.json"

REGISTER_NAMES = {  # same order and names as E3
    "app_style": "App's own phrasing",
    "officer": "Formal officer note",
    "sms": "Informal / SMS spelling",
    "kriol_inf": "Kriol-influenced (approx.)",
}
# Same styling as run_experiments.py. Grey = the rule-based baseline, blue = the model.
BLUE, GREY = "#2a78d6", "#a3a29c"
INK, MUTED, GRID = "#0b0b0b", "#52514e", "#e4e3df"


def panel(ax, keyword, model, title, xmax, labels):
    y = np.arange(len(keyword))
    h = 0.36
    ax.barh(y + h / 2, keyword, height=h - 0.04, color=GREY, label="Keyword parser")
    ax.barh(y - h / 2, model, height=h - 0.04, color=BLUE, label="Fine-tuned Gemma")
    for yi, k, m in zip(y, keyword, model):
        ax.text(k + xmax * 0.01, yi + h / 2, f"{k:.1f}%", va="center", fontsize=7.5, color=INK)
        ax.text(m + xmax * 0.01, yi - h / 2, f"{m:.1f}%", va="center", fontsize=7.5, color=INK)
    ax.set_yticks(y, labels, fontsize=8, color=INK)
    ax.set_xlim(0, xmax)
    ax.set_xticks(np.linspace(0, xmax, 5))
    ax.set_title(title, fontsize=9, color=INK, loc="left")
    ax.set_xlabel("Urgent reports read as routine (%)", fontsize=8, color=MUTED)
    ax.grid(axis="x", color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=8)


def two_readers(model: str) -> dict:
    """Both readers on every report; the more urgent reading wins. An urgent report
    is then missed only if both readers miss it. The price is more reports held
    for a person: any report where either reader found no hazard."""
    from fairqueue.parser import parse
    from fairqueue.taxonomy import SAFETY_ORDER
    rank = {s: i for i, s in enumerate(SAFETY_ORDER)}
    higher = lambda a, b: a if rank[a] >= rank[b] else b  # noqa: E731
    routine = lambda level: level in ("medium", "low")  # noqa: E731
    rows = list(csv.DictReader(ROWS.open(encoding="utf-8")))
    out = {}
    for reg in REGISTER_NAMES:
        x = [r for r in rows if r["register"] == reg]
        urgent = [r for r in x if r["truth"] in ("critical", "high")]
        if not x or not urgent:
            continue
        pct = lambda hits, base: round(100 * sum(hits) / len(base), 1)  # noqa: E731
        out[reg] = {
            "n": len(x),
            "pct_urgent_read_as_routine": pct([routine(higher(r["keyword"], r[f"{model}|level"])) for r in urgent], urgent),
            "pct_urgent_read_as_routine_with_fail_safe":
                pct([routine(higher(r["keyword_fs"], r[f"{model}|fs"])) for r in urgent], urgent),
            "pct_sent_to_human_check":
                pct([not parse(r["text"])["urgency_flags"] or not r[f"{model}|flags"] for r in x], x),
        }
    return out


def main() -> int:
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    name, model = next(iter(data["models"].items()))
    regs = [r for r in REGISTER_NAMES if r in model["by_register"]][::-1]
    kw, md = data["keyword_parser"], model["by_register"]
    pick = lambda block, key: [block[r][key] for r in regs]  # noqa: E731

    fig, axes = plt.subplots(1, 2, figsize=(8.6, 2.7), dpi=300, sharey=True)
    panel(axes[0], pick(kw, "pct_urgent_read_as_routine"), pick(md, "pct_urgent_read_as_routine"),
          "Reader alone (scale 0-100%)", 100, [REGISTER_NAMES[r] for r in regs])
    panel(axes[1], pick(kw, "pct_urgent_read_as_routine_with_fail_safe"),
          pick(md, "pct_urgent_read_as_routine_with_fail_safe"),
          "With the fail-safe (scale 0-20%)", 20, [REGISTER_NAMES[r] for r in regs])
    axes[0].legend(frameon=False, fontsize=8, loc="lower center", ncol=2, bbox_to_anchor=(0.5, 1.12))
    fig.tight_layout()
    TARGET.parent.mkdir(exist_ok=True)
    fig.savefig(TARGET, bbox_inches="tight")
    plt.close(fig)
    print(f"Wrote {TARGET.relative_to(HERE)} from {SOURCE.relative_to(HERE)} (model: {name})")

    if ROWS.exists():
        both = two_readers(name)
        TWO.write_text(json.dumps({"model": name, "rule": "more urgent reading wins", "by_register": both},
                                  indent=1), encoding="utf-8")
        print("\nUrgent reports read as routine with the fail-safe (%) / reports sent to a person (%)")
        print(f"{'':28s}{'keyword':>16s}{'model':>16s}{'both':>16s}")
        for reg, b in both.items():
            k, m = kw[reg], md[reg]
            cell = lambda d: f"{d['pct_urgent_read_as_routine_with_fail_safe']:5.1f} / {d.get('pct_sent_to_human_check', float('nan')):5.1f}"  # noqa: E731
            print(f"{REGISTER_NAMES[reg]:28s}{cell(k):>16s}{cell(m):>16s}{cell(b):>16s}")
        print(f"Wrote {TWO.relative_to(HERE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
