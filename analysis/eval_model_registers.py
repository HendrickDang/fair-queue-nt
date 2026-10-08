"""
E5: how well does the language model read reports in each writing style?

Runs the report text of analysis/data/register_test_set.csv (2,640 reports:
22 faults x 30 reports x 4 writing styles) through a model served by Ollama,
and reports the same measures as experiment E3 does for the keyword parser, so
the two can be compared row for row.

The model is called exactly as the web app calls it (same system prompt, JSON
output, temperature 0), so this measures the parser the app would really use.

Usage (from the analysis/ folder, with Ollama running):

    # 1. check the script works, without calling any model (about 2 seconds)
    python eval_model_registers.py --dry-run

    # 2. quick run: 5 reports per fault per style = 440 reports
    python eval_model_registers.py --model nt-housing-triage --per-scenario 5

    # 3. full run: all 2,640 reports, fine-tuned model and the un-tuned baseline
    python eval_model_registers.py --model nt-housing-triage --model gemma-4-e4b-baseline

It is safe to stop and start again: every answer is saved as it arrives in
results/e5_model_cache.jsonl, and a restarted run skips what is already there.

Writes results/e5_model_registers.json (the summary) and
results/e5_model_rows.csv (one line per report and model).

Needs only the Python standard library.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fairqueue.parser import escalate_safety, fail_safe, parse  # noqa: E402
from fairqueue.taxonomy import (  # noqa: E402
    CATEGORIES, SAFETY_ORDER, URGENCY_FLAGS, VULNERABILITIES,
)

HERE = Path(__file__).parent
DATA = HERE / "data" / "register_test_set.csv"
RESULTS = HERE / "results"
CACHE = RESULTS / "e5_model_cache.jsonl"

REGISTERS = {  # same order and names as E3
    "app_style": "App's own phrasing",
    "officer": "Formal officer note",
    "sms": "Informal / SMS spelling",
    "kriol_inf": "Kriol-influenced (approx.)",
}
TRADES = ["plumber", "electrician", "carpenter", "hvac", "handyperson", "multi"]
SAFETY_LEVELS = ["critical", "high", "medium", "low"]

# The web app's system prompt (nt-housing-triage/lib/parser/ollama.ts), built
# from the same lists so the model sees exactly what it sees in the app and
# saw in fine-tuning.
SYSTEM_PROMPT = f"""You are a maintenance triage parser for remote Northern Territory (NT) social housing.
Read a tenant's free-text fault report and return ONLY a JSON object, no prose.

Schema:
{{
  "summary": string,                       // one short normalised description
  "category": one of {" | ".join(CATEGORIES)},
  "safety_level": one of {" | ".join(SAFETY_LEVELS)},
  "urgency_flags": array of {" | ".join(URGENCY_FLAGS)},
  "occupant_vulnerability": array of {" | ".join(VULNERABILITIES)},
  "trade_required": one of {" | ".join(TRADES)},
  "community": string                       // the NT community named, else ""
}}

Rules:
- Escalate to critical for exposed wiring, sewage, structural collapse, medical equipment power, or no water for vulnerable occupants.
- Only include vulnerability values actually implied by the text.
- Never invent a community that is not named in the report."""


# --- calling the model ---------------------------------------------------------

def ask_ollama(text: str, model: str, url: str, timeout: float) -> str:
    """One chat call, the same request the web app sends. Returns the raw reply."""
    body = json.dumps({
        "model": model,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
    }).encode("utf-8")
    req = urllib.request.Request(f"{url}/api/chat", data=body,
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8")).get("message", {}).get("content", "")


def coerce(raw_reply: str):
    """Turn the model's reply into the app's schema, as coerceModelOutput does.
    Returns (report, json_valid). A reply that is not a JSON object is invalid;
    the app would fall back to the keyword parser for it."""
    try:
        v = json.loads(raw_reply)
    except (ValueError, TypeError):
        return None, False
    if not isinstance(v, dict):
        return None, False
    pick = lambda value, allowed, default: value if isinstance(value, str) and value in allowed else default
    many = lambda value, allowed: [x for x in dict.fromkeys(value) if isinstance(x, str) and x in allowed] \
        if isinstance(value, list) else []
    return {
        "category": pick(v.get("category"), CATEGORIES, "other"),
        "safety_level": pick(v.get("safety_level"), SAFETY_LEVELS, "medium"),
        "urgency_flags": many(v.get("urgency_flags"), URGENCY_FLAGS),
        "occupant_vulnerability": many(v.get("occupant_vulnerability"), VULNERABILITIES),
    }, True


def read(text: str, model: str, args, cache: dict) -> dict:
    """The model's reading of one report: its fields, plus the safety level the
    ranking engine would act on (the model's level after the engine's own
    escalation rules, exactly as scoreNeed applies them)."""
    key = f"{model}\t{text}"
    if key not in cache:
        if args.dry_run:
            # No model: answer with the keyword parser, to prove the pipeline end to end.
            p = parse(text)
            reply = json.dumps({k: p[k] for k in ("category", "safety_level", "urgency_flags", "occupant_vulnerability")})
            seconds = 0.0
        else:
            started = time.time()
            reply = ask_ollama(text, model, args.url, args.timeout)
            seconds = time.time() - started
        cache[key] = {"model": model, "text": text, "reply": reply, "seconds": round(seconds, 3)}
        if not args.dry_run:
            with CACHE.open("a", encoding="utf-8") as f:
                f.write(json.dumps(cache[key], ensure_ascii=False) + "\n")
    hit = cache[key]
    report, valid = coerce(hit["reply"])
    if not valid:
        # The app falls back to the keyword parser when the model's reply is unusable.
        p = parse(text)
        report = {k: p[k] for k in ("category", "safety_level", "urgency_flags", "occupant_vulnerability")}
    level = escalate_safety(report["safety_level"], report["urgency_flags"], report["occupant_vulnerability"])
    return {**report, "raw_safety_level": report["safety_level"], "safety_level": level,
            "json_valid": valid, "seconds": hit["seconds"]}


# --- scoring: the same measures as E3 ----------------------------------------------

LEVEL = {s: i for i, s in enumerate(SAFETY_ORDER)}


def summarise(rows: list, pred: str, pred_fs: str, check: str) -> dict:
    """Per writing style: how often an urgent report is read as routine, with and
    without the fail-safe, and how many reports the fail-safe sends to a person."""
    out = {}
    for reg in REGISTERS:
        x = [r for r in rows if r["register"] == reg]
        if not x:
            continue
        urgent = [r for r in x if r["truth"] in ("critical", "high")]
        pct = lambda hits, base: round(100 * sum(hits) / max(1, len(base)), 1)
        out[reg] = {
            "n": len(x),
            "pct_exact": pct([r[pred] == r["truth"] for r in x], x),
            "pct_under_triaged": pct([LEVEL[r[pred]] < LEVEL[r["truth"]] for r in x], x),
            "pct_urgent_read_as_routine": pct([r[pred] in ("medium", "low") for r in urgent], urgent),
            "pct_urgent_read_as_routine_with_fail_safe": pct([r[pred_fs] in ("medium", "low") for r in urgent], urgent),
            "pct_sent_to_human_check": pct([r[check] for r in x], x),
        }
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Compare a language-model parser with the keyword parser, by writing style.")
    ap.add_argument("--model", action="append", help="Ollama model name. Repeat to compare several (default: nt-housing-triage).")
    ap.add_argument("--url", default="http://127.0.0.1:11434", help="Ollama address.")
    ap.add_argument("--timeout", type=float, default=120, help="Seconds to wait for one answer.")
    ap.add_argument("--per-scenario", type=int, default=0,
                    help="Use only the first N reports per fault per style (0 = all 30). 5 gives a 440-report quick run.")
    ap.add_argument("--dry-run", action="store_true",
                    help="Do not call any model: answer with the keyword parser to check the script works.")
    args = ap.parse_args()
    models = args.model or ["nt-housing-triage"]
    if args.dry_run:
        models = ["dry-run (keyword parser standing in for the model)"]
    RESULTS.mkdir(exist_ok=True)

    with DATA.open(encoding="utf-8") as f:
        reports = list(csv.DictReader(f))
    if args.per_scenario > 0:
        seen, keep = {}, []
        for r in reports:
            k = (r["register"], r["scenario_id"])
            seen[k] = seen.get(k, 0) + 1
            if seen[k] <= args.per_scenario:
                keep.append(r)
        reports = keep

    cache = {}
    if CACHE.exists() and not args.dry_run:
        for line in CACHE.read_text(encoding="utf-8").splitlines():
            if line.strip():
                hit = json.loads(line)
                cache[f"{hit['model']}\t{hit['text']}"] = hit

    if not args.dry_run:
        try:
            urllib.request.urlopen(f"{args.url}/api/tags", timeout=5).read()
        except (urllib.error.URLError, OSError) as e:
            print(f"Cannot reach Ollama at {args.url} ({e}). Start Ollama, or use --dry-run to test the script.")
            return 1

    # The keyword parser on the same reports, for the side-by-side comparison.
    rows = []
    for r in reports:
        p = parse(r["report_text"])
        f = fail_safe(p)
        rows.append({"report_id": r["report_id"], "register": r["register"], "scenario_id": r["scenario_id"],
                     "text": r["report_text"], "truth": r["true_safety_level"],
                     "keyword": p["safety_level"], "keyword_fs": f["safety_level"], "keyword_check": f["needs_human_check"]})

    summary = {
        "reports": len(rows),
        "note": ("Safety level is the one the ranking engine acts on: the parser's level after the engine's "
                 "escalation rules. Fail-safe: a report with no recognised hazard is held at 'high' and sent to a person."),
        "keyword_parser": summarise(rows, "keyword", "keyword_fs", "keyword_check"),
        "models": {},
    }

    for model in models:
        todo = sum(1 for r in rows if f"{model}\t{r['text']}" not in cache)
        print(f"\n{model}: {len(rows)} reports, {todo} still to ask")
        started, asked, failed = time.time(), 0, 0
        for i, r in enumerate(rows):
            fresh = f"{model}\t{r['text']}" not in cache
            try:
                m = read(r["text"], model, args, cache)
            except (urllib.error.URLError, OSError, ValueError) as e:
                failed += 1
                if failed == 1:
                    print(f"  a call failed ({e}); such reports are counted as unreadable replies")
                cache[f"{model}\t{r['text']}"] = {"model": model, "text": r["text"], "reply": "", "seconds": 0.0}
                m = read(r["text"], model, args, cache)
                del cache[f"{model}\t{r['text']}"]  # not saved: it is asked again on the next run
            asked += fresh
            fs = fail_safe({"safety_level": m["safety_level"], "urgency_flags": m["urgency_flags"]})
            r.update({f"{model}|level": m["safety_level"], f"{model}|raw": m["raw_safety_level"],
                      f"{model}|fs": fs["safety_level"], f"{model}|check": fs["needs_human_check"],
                      f"{model}|valid": m["json_valid"], f"{model}|seconds": m["seconds"],
                      f"{model}|flags": "|".join(m["urgency_flags"])})
            if fresh and asked % 25 == 0:
                rate = (time.time() - started) / asked
                print(f"  {i + 1}/{len(rows)}  about {rate:.1f}s each, {rate * (todo - asked) / 60:.0f} min left", flush=True)
        s = summarise(rows, f"{model}|level", f"{model}|fs", f"{model}|check")
        valid = [r[f"{model}|valid"] for r in rows]
        times = [r[f"{model}|seconds"] for r in rows if r[f"{model}|seconds"] > 0]
        summary["models"][model] = {
            "json_valid_pct": round(100 * sum(valid) / len(valid), 1),
            "failed_calls": failed,
            "mean_seconds_per_report": round(sum(times) / len(times), 2) if times else None,
            "by_register": s,
        }

    # --- outputs ---
    stem = "e5_dry_run" if args.dry_run else "e5_model"
    (RESULTS / f"{stem}_registers.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    cols = ["report_id", "register", "scenario_id", "truth", "keyword", "keyword_fs"]
    for model in models:
        cols += [f"{model}|level", f"{model}|raw", f"{model}|fs", f"{model}|valid", f"{model}|flags"]
    with (RESULTS / f"{stem}_rows.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols + ["text"], extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    print("\nUrgent reports read as routine (%), lower is better. In brackets: with the fail-safe.")
    names = ["keyword parser"] + models
    print(f"{'':28}" + "".join(f"{n[:22]:>24}" for n in names))
    for reg, label in REGISTERS.items():
        cells = []
        for n in names:
            s = summary["keyword_parser"] if n == "keyword parser" else summary["models"][n]["by_register"]
            if reg in s:
                cells.append(f"{s[reg]['pct_urgent_read_as_routine']:5.1f} ({s[reg]['pct_urgent_read_as_routine_with_fail_safe']:4.1f})")
        print(f"{label:28}" + "".join(f"{c:>24}" for c in cells))
    for model in models:
        m = summary["models"][model]
        print(f"\n{model}: valid JSON {m['json_valid_pct']}%, failed calls {m['failed_calls']}, "
              f"mean {m['mean_seconds_per_report']} s per report")
    print(f"\nWrote results/{stem}_registers.json and results/{stem}_rows.csv")
    if not args.dry_run:
        print("Send both files back, plus results/e5_model_cache.jsonl.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
