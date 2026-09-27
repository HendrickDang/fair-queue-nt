"""
Field-level evaluation for the triage parser: base model vs fine-tuned.

Reports, on the held-out `training/out/eval.jsonl` split:
    * json_valid        -- fraction of generations that parse as JSON
    * category / safety_level / trade_required -- exact-match accuracy
    * urgency_flags / occupant_vulnerability   -- micro + macro set F1
    * community         -- exact-match accuracy (should be 1.0 by construction,
                           but shows whether the model echoes the right place)

Usage
-----
    # base model, as a before/after baseline
    python training/evaluate_gemma4.py --out training/out/eval-base.json

    # fine-tuned LoRA adapter
    python training/evaluate_gemma4.py \
        --adapter training/models/gemma4-e4b-lora \
        --out training/out/eval-finetuned.json

    # quick sanity run on 25 rows
    python training/evaluate_gemma4.py --limit 25
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent

SINGLE_FIELDS = ("category", "safety_level", "trade_required", "community")
SET_FIELDS = ("urgency_flags", "occupant_vulnerability")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Field-level F1 for the triage parser.")
    p.add_argument("--model", default="unsloth/gemma-4-E4B-it")
    p.add_argument("--adapter", default=None,
                   help="Path to the saved LoRA adapter (training/models/gemma4-e4b-lora).")
    p.add_argument("--eval-file", default=str(HERE / "out" / "eval.jsonl"))
    p.add_argument("--out", default=str(HERE / "out" / "eval-report.json"))
    p.add_argument("--limit", type=int, default=0, help="Evaluate only the first N rows.")
    p.add_argument("--max-new-tokens", type=int, default=256,
                   help="Enough to emit the full JSON object (plus any code fence).")
    p.add_argument("--max-seq-length", type=int, default=512)
    p.add_argument("--chat-template", default="gemma-4")
    return p.parse_args()


def load_for_eval(model_name: str, adapter: str | None, max_seq_length: int, chat_template: str):
    from unsloth import FastModel
    from unsloth.chat_templates import get_chat_template

    model, tokenizer = FastModel.from_pretrained(
        model_name=model_name,
        dtype=None,
        max_seq_length=max_seq_length,
        load_in_4bit=True,
        full_finetuning=False,
    )
    tokenizer = get_chat_template(tokenizer, chat_template=chat_template)

    if adapter:
        applied = False
        if hasattr(model, "load_adapter"):
            for variant in (
                lambda: model.load_adapter(adapter, adapter_name="trained"),
                lambda: model.load_adapter(adapter, "trained"),
            ):
                try:
                    variant()
                    applied = True
                    break
                except Exception as exc:  # noqa: BLE001
                    print(f"[eval] load_adapter variant failed: {exc}")
            if applied:
                try:
                    model.set_adapter("trained")
                except Exception:  # noqa: BLE001
                    pass
        if not applied:
            from peft import PeftModel
            model = PeftModel.from_pretrained(model, adapter)
        print(f"[eval] loaded adapter: {adapter}")

    model.eval()
    return model, tokenizer


def to_parts(role: str, content: str) -> dict:
    """Gemma 4 is multimodal: with tokenize=True the processor expects content
    as a list of typed parts, not a bare string (a plain string is iterated
    character-by-character and fails with 'string indices must be integers')."""
    return {"role": role, "content": [{"type": "text", "text": content}]}


def generate(model, tokenizer, messages: list[dict], max_new_tokens: int) -> str:
    import torch

    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to("cuda")

    with torch.inference_mode():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,          # greedy -- matches the app (temperature 0)
            use_cache=True,
        )
    text = tokenizer.decode(out[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True)
    return text.strip()


def extract_json(text: str) -> dict | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        return None
    try:
        obj = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return obj if isinstance(obj, dict) else None


def set_f1(pred: list, gold: list) -> tuple[float, float, float]:
    p, g = set(pred or []), set(gold or [])
    tp = len(p & g)
    precision = tp / len(p) if p else (1.0 if not g else 0.0)
    recall = tp / len(g) if g else 1.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    return precision, recall, f1


def evaluate(args: argparse.Namespace) -> dict:
    rows = [json.loads(line) for line in Path(args.eval_file).read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.limit:
        rows = rows[: args.limit]

    model, tokenizer = load_for_eval(args.model, args.adapter, args.max_seq_length, args.chat_template)

    single_hits = defaultdict(int)
    single_total = defaultdict(int)
    set_scores = defaultdict(list)
    json_valid = 0
    samples = []

    for i, row in enumerate(rows):
        messages = row["messages"]
        system = next((m["content"] for m in messages if m["role"] == "system"), None)
        report = next(m["content"] for m in messages if m["role"] == "user")
        gold = json.loads(next(m["content"] for m in messages if m["role"] == "assistant"))

        chat: list[dict] = []
        if system:
            chat.append(to_parts("system", system))
        chat.append(to_parts("user", report))

        raw = generate(model, tokenizer, chat, args.max_new_tokens)
        pred = extract_json(raw)

        if pred is not None:
            json_valid += 1
            for field in SINGLE_FIELDS:
                single_total[field] += 1
                if pred.get(field) == gold.get(field):
                    single_hits[field] += 1
            for field in SET_FIELDS:
                _, _, f1 = set_f1(pred.get(field), gold.get(field))
                set_scores[field].append(f1)

        if len(samples) < 5:
            samples.append({
                "report": report,
                "gold": gold,
                "raw_output": raw,
                "parsed": pred,
            })

        if (i + 1) % 25 == 0:
            print(f"[eval] {i + 1}/{len(rows)}")

    report = {
        "model": args.model,
        "adapter": args.adapter,
        "rows": len(rows),
        "json_valid_rate": round(json_valid / len(rows), 4) if rows else 0.0,
        "single_field_accuracy": {
            f: round(single_hits[f] / single_total[f], 4) if single_total[f] else None
            for f in SINGLE_FIELDS
        },
        "set_field_f1_macro": {
            f: round(sum(v) / len(v), 4) if v else None for f, v in set_scores.items()
        },
        "samples": samples,
    }
    return report


def main() -> None:
    args = parse_args()
    report = evaluate(args)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("\n=== summary ===")
    print(f"json_valid        : {report['json_valid_rate']}")
    for f, acc in report["single_field_accuracy"].items():
        print(f"{f:<18}: {acc}")
    for f, f1 in report["set_field_f1_macro"].items():
        print(f"{f:<18}: F1 {f1}")
    print(f"\nfull report -> {out}")


if __name__ == "__main__":
    main()
