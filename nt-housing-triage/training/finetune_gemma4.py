"""
Fine-tune Gemma 4 E4B as the NT remote-housing maintenance triage parser.

Toolchain : unsloth + QLoRA (4-bit NF4), single NVIDIA RTX 3080 (10 GB).
Task      : free-text fault report  ->  the taxonomy JSON schema (taxonomy.md §1).
Data      : training/out/{train,eval}.jsonl  (chat format, from `npm run training:generate`).

Why Unsloth (and not plain transformers + PEFT)?
    Gemma 4 E2B/E4B share KV state across layers (num_kv_shared_layers = 18).
    When `use_cache=False` -- which gradient checkpointing forces -- stock
    transformers recomputes K/V locally and produces garbage logits, so training
    silently diverges. Unsloth ships the fix. Always train Gemma 4 through Unsloth.

Why the base weights are the HF repo, not the GGUF you were given:
    GGUF is an inference-only container (quantised, no autograd graph, no
    optimiser state). It cannot be LoRA/QLoRA fine-tuned. We fine-tune the
    original bf16 weights for the same model and re-quantise to GGUF afterwards.

Usage
-----
    python training/finetune_gemma4.py                     # full run (2 epochs)
    python training/finetune_gemma4.py --max-steps 20      # smoke test
    python training/finetune_gemma4.py --export-gguf       # train then export GGUF

    # If VRAM is tight (E4B QLoRA wants ~10 GB):
    python training/finetune_gemma4.py --max-seq-length 384
    # If E4B keeps OOMing on the 10 GB card, the plan's fallback is the smaller
    # model -- it trains on 8 GB and still beats the deterministic parser:
    python training/finetune_gemma4.py --model unsloth/gemma-4-E2B-it
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

# Must be set before torch initialises CUDA -- reduces allocator fragmentation,
# which is what usually causes the last few hundred MB to OOM on a 10 GB card.
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

HERE = Path(__file__).resolve().parent
_LOCAL_BASE = HERE / "models" / "base"
_DEFAULT_BASE = (
    str(_LOCAL_BASE) if (_LOCAL_BASE / "config.json").exists() else "unsloth/gemma-4-E2B-it"
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="QLoRA fine-tune Gemma 4 (unsloth).")
    p.add_argument("--model", default=_DEFAULT_BASE,
                   help="HF repo id or local dir of the base model (bf16 safetensors).")
    p.add_argument("--train-file", default=str(HERE / "out" / "train.jsonl"))
    p.add_argument("--eval-file", default=str(HERE / "out" / "eval.jsonl"))
    p.add_argument("--output-dir", default=str(HERE / "models" / "gemma4-e4b-lora"))
    p.add_argument("--chat-template", default="gemma-4",
                   help="Unsloth chat template. 'gemma-4' (non-thinking) is recommended "
                        "for the small E2B/E4B models; use 'gemma-4-thinking' otherwise.")
    p.add_argument("--max-seq-length", type=int, default=512,
                   help="Reports are short; 512 is plenty and keeps VRAM low.")
    p.add_argument("--epochs", type=float, default=2.0)
    p.add_argument("--max-steps", type=int, default=-1,
                   help="Set >0 for a smoke test instead of a full run.")
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--save-steps", type=int, default=100)
    p.add_argument("--eval-steps", type=int, default=100)
    p.add_argument("--seed", type=int, default=3407)
    p.add_argument("--no-eval", action="store_true", help="Skip the eval split during training.")
    p.add_argument("--export-gguf", action="store_true",
                   help="After training, merge + convert to Q4_K_M GGUF in one go.")
    p.add_argument("--gguf-dir", default=str(HERE / "models" / "gguf"))
    return p.parse_args()


def vram(tag: str, torch) -> None:
    if not torch.cuda.is_available():
        return
    free, total = torch.cuda.mem_get_info()
    print(f"[vram] {tag}: {free / 2**30:.2f} GiB free / {total / 2**30:.2f} GiB total")


def main() -> None:
    args = parse_args()

    import torch
    from unsloth import FastModel  # Unsloth first — before trl/transformers/peft
    from datasets import load_dataset
    from trl import SFTConfig, SFTTrainer
    from unsloth.chat_templates import get_chat_template, train_on_responses_only

    if not torch.cuda.is_available():
        raise SystemExit(
            "No CUDA GPU visible. Activate the Unsloth env (training/setup-env.ps1) "
            "and make sure the NVIDIA driver is working (nvidia-smi)."
        )

    train_file = Path(args.train_file)
    if not train_file.exists():
        raise SystemExit(
            f"Missing {train_file}. Generate the dataset first:\n"
            f"    npm run training:generate -- 3000"
        )

    print(f"[cfg] base={args.model}  seq={args.max_seq_length}  "
          f"epochs={args.epochs}  lr={args.lr}  r={args.lora_r}  ga={args.grad_accum}")
    vram("before load", torch)

    # ------------------------------------------------------------------ model
    model, tokenizer = FastModel.from_pretrained(
        model_name=args.model,
        dtype=None,                     # auto (bf16 on Ampere)
        max_seq_length=args.max_seq_length,
        load_in_4bit=True,              # QLoRA
        full_finetuning=False,
    )
    vram("after load", torch)

    peft_kwargs = dict(
        finetune_vision_layers=False,    # text-only task
        finetune_language_layers=True,
        finetune_attention_modules=True,
        finetune_mlp_modules=True,
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.0,
        bias="none",
        random_state=args.seed,
    )
    try:
        model = FastModel.get_peft_model(model, use_gradient_checkpointing="unsloth", **peft_kwargs)
    except TypeError:
        # Older/newer signature without the gradient-checkpointing kwarg.
        model = FastModel.get_peft_model(model, **peft_kwargs)

    tokenizer = get_chat_template(tokenizer, chat_template=args.chat_template)

    # ------------------------------------------------------------------- data
    data_files = {"train": str(train_file)}
    eval_file = Path(args.eval_file)
    if eval_file.exists() and not args.no_eval:
        data_files["eval"] = str(eval_file)
    raw = load_dataset("json", data_files=data_files)

    def format_batch(examples: dict) -> dict:
        texts = [
            tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=False
            ).removeprefix("<bos>")
            for messages in examples["messages"]
        ]
        return {"text": texts}

    dataset = raw.map(format_batch, batched=True, remove_columns=raw["train"].column_names)
    print(f"[data] train={len(dataset['train'])}"
          + (f"  eval={len(dataset['eval'])}" if "eval" in dataset else ""))

    use_eval = "eval" in dataset
    bf16_ok = torch.cuda.is_bf16_supported()

    # In-training eval computes the (fused) cross-entropy over the whole eval
    # split. Gemma 4's 262k vocab makes that scratch buffer large, so on a
    # near-full 10 GB card it OOMs even though training itself fits. Skip it and
    # use training/evaluate_gemma4.py (generation-based F1) afterwards.
    if use_eval:
        free_vram, _ = torch.cuda.mem_get_info()
        if free_vram < 2.5 * 2**30:
            print(f"[warn] only {free_vram / 2**30:.2f} GiB VRAM free — skipping "
                  f"in-training eval to avoid OOM (run evaluate_gemma4.py later).")
            use_eval = False

    # ------------------------------------------------------------------ train
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        train_dataset=dataset["train"],
        eval_dataset=dataset["eval"] if use_eval else None,
        args=SFTConfig(
            dataset_text_field="text",
            max_length=args.max_seq_length,
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=args.grad_accum,
            warmup_ratio=0.03,
            num_train_epochs=args.epochs,
            max_steps=args.max_steps,
            learning_rate=args.lr,
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.001,
            lr_scheduler_type="linear",
            seed=args.seed,
            report_to="none",
            output_dir=str(args.output_dir),
            save_steps=args.save_steps,
            save_total_limit=2,
            eval_strategy="steps" if use_eval else "no",
            eval_steps=args.eval_steps if use_eval else None,
            bf16=bf16_ok,
            fp16=not bf16_ok,
        ),
    )

    # Only compute loss on the assistant JSON, not on the system prompt / report.
    trainer = train_on_responses_only(
        trainer,
        instruction_part="<|turn>user\n",
        response_part="<|turn>model\n",
    )

    vram("before train", torch)
    stats = trainer.train()
    vram("after train", torch)

    # ------------------------------------------------------------------- save
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    (out_dir / "train_metrics.json").write_text(
        json.dumps(stats.metrics, indent=2, default=str), encoding="utf-8"
    )
    print(f"[save] LoRA adapter -> {out_dir}")
    print(f"[save] metrics      -> {out_dir / 'train_metrics.json'}")

    # ------------------------------------------------------------------ gguf
    if args.export_gguf:
        gguf_dir = Path(args.gguf_dir)
        gguf_dir.mkdir(parents=True, exist_ok=True)
        print(f"[gguf] merging + converting to Q4_K_M -> {gguf_dir}")
        model.save_pretrained_gguf(str(gguf_dir), tokenizer, quantization_method="q4_k_m")
        print(f"[gguf] done. Point Ollama at it with training/Modelfile.")


if __name__ == "__main__":
    main()
