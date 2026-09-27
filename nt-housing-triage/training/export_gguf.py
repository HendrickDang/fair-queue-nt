"""
Merge the LoRA adapter and export a Q4_K_M GGUF for Ollama.

The simple path is to export straight after training:

    python training/finetune_gemma4.py --export-gguf

This script is the standalone equivalent, for when you already have an adapter
on disk and don't want to retrain.

    python training/export_gguf.py
    python training/export_gguf.py --adapter training/models/gemma4-e4b-lora \
                                   --out training/models/gguf

Note: merging dequantises the 4-bit base back to bf16 (~16 GB) and converts with
llama.cpp. It needs ~16-20 GB of RAM (or VRAM) headroom and can take 10-20 min on
a laptop. If it is too tight, export on a machine with more RAM, or upload the
adapter to the free Unsloth Colab notebook and export there.
"""

from __future__ import annotations

import argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent
_LOCAL_BASE = HERE / "models" / "base"
# Prefer the base the model was actually trained on; fall back to the E2B repo.
_DEFAULT_BASE = (
    str(_LOCAL_BASE) if (_LOCAL_BASE / "config.json").exists() else "unsloth/gemma-4-E2B-it"
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Merge LoRA + export GGUF for Ollama.")
    p.add_argument("--model", default=_DEFAULT_BASE,
                   help="Base model the adapter was trained on (local dir or HF repo id).")
    p.add_argument("--adapter", default=str(HERE / "models" / "gemma4-e4b-lora"))
    p.add_argument("--out", default=str(HERE / "models" / "gguf"))
    p.add_argument("--max-seq-length", type=int, default=512)
    p.add_argument("--quantization", default="q4_k_m",
                   choices=["q4_k_m", "q8_0", "f16"])
    return p.parse_args()


def main() -> None:
    args = parse_args()

    from unsloth import FastModel

    adapter = Path(args.adapter)
    if not adapter.exists():
        raise SystemExit(
            f"No adapter at {adapter}. Train first:\n"
            f"    python training/finetune_gemma4.py"
        )

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"[load] base={args.model}")
    model, tokenizer = FastModel.from_pretrained(
        model_name=args.model,
        dtype=None,
        max_seq_length=args.max_seq_length,
        load_in_4bit=True,          # unsloth dequantises during merge
        full_finetuning=False,
    )

    # Re-attach the LoRA exactly as during training, then load the saved weights.
    try:
        model = FastModel.get_peft_model(
            model,
            finetune_vision_layers=False,
            finetune_language_layers=True,
            finetune_attention_modules=True,
            finetune_mlp_modules=True,
            r=16,
            lora_alpha=16,
            lora_dropout=0.0,
            bias="none",
            random_state=3407,
        )
    except TypeError:
        model = FastModel.get_peft_model(model, r=16, lora_alpha=16)

    # Attach the trained LoRA. PEFT's signature is load_adapter(model_id,
    # adapter_name, ...); use a distinct name so it doesn't clash with the
    # 'default' adapter created above, then activate it.
    loaded = False
    if hasattr(model, "load_adapter"):
        for variant in (
            lambda: model.load_adapter(str(adapter), adapter_name="trained"),
            lambda: model.load_adapter(str(adapter), "trained"),
        ):
            try:
                variant()
                loaded = True
                break
            except Exception as exc:  # noqa: BLE001
                print(f"[load] load_adapter variant failed: {exc}")
        if loaded:
            try:
                model.set_adapter("trained")
            except Exception:  # noqa: BLE001
                pass
    if not loaded:
        print("[load] falling back to PeftModel.from_pretrained")
        from peft import PeftModel
        model = PeftModel.from_pretrained(model, str(adapter))
    print(f"[load] adapter={adapter}")

    print(f"[gguf] converting ({args.quantization}) -> {out}")
    try:
        model.save_pretrained_gguf(str(out), tokenizer, quantization_method=args.quantization)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            f"save_pretrained_gguf failed: {exc}\n\n"
            "Fallback (manual):\n"
            "  1. model.save_pretrained_merged('training/models/merged', tokenizer, "
            "save_method='merged_16bit')\n"
            "  2. python llama.cpp/convert_hf_to_gguf.py training/models/merged "
            "--outfile training/models/gguf/model-f16.gguf\n"
            "  3. llama-quantize training/models/gguf/model-f16.gguf "
            "training/models/gguf/model-Q4_K_M.gguf Q4_K_M"
        )

    print("[gguf] done. Next:")
    print("    ollama create nt-housing-triage -f training/Modelfile")


if __name__ == "__main__":
    main()
