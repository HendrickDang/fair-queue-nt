# Fine-tuning the parser (Gemma 4 E4B, unsloth + QLoRA)

The parser is **model-first with a deterministic fallback**. This folder holds the
dataset generator, the QLoRA recipe, the evaluator and the GGUF/Ollama export for
the fine-tuned **Gemma 4 E4B** parser.

> **Plan vs. reality.** `nt-housing-maintenance-triage.md` nominates
> Qwen2.5-3B-Instruct and an 8 GB RTX 3080. This build fine-tunes **Gemma 4 E4B**
> (the model supplied in `gemma-4-E4B-it-GGUF/`) on the RTX 3080 **10 GB**.
> Everything else in the plan — parser-only scope, synthetic data, field-level
> eval, offline Ollama serving — is unchanged.

## 0. Why we do not fine-tune the GGUF you have

`gemma-4-E4B-it-Q4_K_M.gguf` is an **inference-only** container: 4-bit weights,
no autograd graph, no optimiser state, no `lm_head` in trainable form. No LoRA/QLoRA
tool can train it. The correct flow is:

```
google/gemma-4-E4B-it  (bf16 safetensors)  --QLoRA-->  LoRA adapter  --merge-->  Q4_K_M GGUF  -->  Ollama
```

We fine-tune the original bf16 weights for the **same model** and re-quantise to
GGUF at the end. The GGUF you already have stays useful as an inference-only
baseline for comparison.

## Route A — free Colab (no local GPU, no 16 GB download)

`training/finetune_gemma4_colab.ipynb` runs the whole thing on a free Colab T4:
install → train → evaluate → merge → export GGUF. You upload the two JSONL files
and download the finished `unsloth.Q4_K_M.gguf` (~5 GB). The base weights are
fetched and merged on Colab, so this laptop never pulls 16 GB.

1. `Runtime → Change runtime type → T4 GPU`.
2. Run the notebook; upload `training/out/train.jsonl` and `eval.jsonl`.
3. Download the GGUF into `training/models/gguf/` and serve it (§5).

Sections 2–4 below are the local route (Route B) for the RTX 3080.

## 1. Generate the dataset

```bash
npm run training:generate -- 3000
```

Writes `training/out/train.jsonl` (2,700) and `training/out/eval.jsonl` (300) in
chat format:

```json
{"messages":[
  {"role":"system","content":"You are a maintenance triage parser ..."},
  {"role":"user","content":"roof is leaking over my kids bed ..."},
  {"role":"assistant","content":"{\"summary\":\"...\",\"category\":\"structural\",...}"}
]}
```

The assistant target is exactly the taxonomy §1 schema, so the model learns the
same contract the deterministic fallback implements. Same seed → same split, so
the demo stages reproducibly.

## 2. Set up the local environment (Route B)

Unsloth needs Python 3.10–3.12 (the base Anaconda env here is 3.9). Create an
isolated env:

```powershell
powershell -ExecutionPolicy Bypass -File training/setup-env.ps1
conda activate nt-triage
```

Alternatives: the official Unsloth installer
(`irm https://unsloth.ai/install.ps1 | iex`) or Unsloth Studio's UI.

> **Windows torch gotcha.** Plain `pip install unsloth` can resolve to a
> **CPU-only** torch wheel. Check with:
> `python -c "import torch; print(torch.version.cuda, torch.cuda.is_available())"`.
> If `cuda` is `None`, reinstall the CUDA build:
> `pip install --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cu128`

> **Why Unsloth specifically?** Gemma 4 E2B/E4B share KV state across layers. With
> `use_cache=False` — which gradient checkpointing forces — stock transformers
> produces garbage logits and training silently diverges. Unsloth ships the fix.

## 3. Fine-tune

On this 10 GB card, target **E2B** (see the VRAM note below). First pull the base
weights with the parallel downloader — it resumes if interrupted, and an
`HF_TOKEN` lifts the anonymous rate limit:

```powershell
$env:HF_TOKEN = "hf_..."   # optional but much faster
python training/download_model.py --repo unsloth/gemma-4-E2B-it --out training/models/base
```

Then train (add `--export-gguf` to also merge + export in one go):

```bash
python training/finetune_gemma4.py --model training/models/base --export-gguf
```

What the script does: loads `unsloth/gemma-4-E4B-it` in 4-bit, attaches LoRA
(text-only: vision off, attention + MLP on, `r=16`, `alpha=16`), applies the
`gemma-4` chat template, trains on the assistant JSON only
(`train_on_responses_only`), evaluates on the held-out split, saves the adapter to
`training/models/gemma4-e4b-lora/`, then merges and exports Q4_K_M GGUF.

Smoke test first (20 steps, ~1 min):

```bash
python training/finetune_gemma4.py --max-steps 20
```

### VRAM budget (RTX 3080 10 GB)

Unsloth's guidance: **E4B QLoRA needs ~10 GB**; E4B full LoRA needs ~17 GB.
Our reports are short (system prompt + one-line report + small JSON ≈ 300 tokens),
so `--max-seq-length 512` keeps activations tiny.

> **On a 10 GB card (this machine):** with ~8.9 GB actually free, **E2B is the
> sensible local target** — its QLoRA fits in 8 GB, while E4B sits right on the
> ~10 GB line. Train E2B with `--model unsloth/gemma-4-E2B-it`; use E4B only via
> the Colab route (Route A) or a bigger GPU.

If you OOM:

1. close desktop apps (a browser + Teams can hold 1–2 GB),
2. `--max-seq-length 384` (still ample for this task),
3. keep `--batch-size 1 --grad-accum 8`,
4. last resort — the plan's fallback, which trains on 8 GB and still beats the
   deterministic parser:
   ```bash
   python training/finetune_gemma4.py --model unsloth/gemma-4-E2B-it
   ```
5. or train free on Colab (Unsloth's E4B notebook) and copy the adapter back.

`--max-steps 20` is also a good way to confirm the pipeline before a full run.

## 4. Evaluate (base vs fine-tuned)

```bash
python training/evaluate_gemma4.py --out training/out/eval-base.json
python training/evaluate_gemma4.py \
    --adapter training/models/gemma4-e4b-lora \
    --out training/out/eval-finetuned.json
```

Reports `json_valid_rate`, exact-match accuracy for `category` / `safety_level` /
`trade_required` / `community`, and micro/macro set-F1 for `urgency_flags` and
`occupant_vulnerability`, plus five raw samples for a human eyeball check.

For the "matched a big cloud model, fully offline" story, run the same eval file
through a hosted model and compare — facts stay grounded either way.

## 5. Export GGUF and serve with Ollama

If you did not pass `--export-gguf` above:

```bash
python training/export_gguf.py
```

> **Windows gotcha (this machine).** Unsloth's `save_pretrained_gguf` downloads a
> prebuilt llama.cpp app bundle whose deepest Svelte UI path exceeds `MAX_PATH`,
> so extraction fails and it falls back to a slow cmake build. The reliable path
> is the manual exporter, which fetches a clean CPU build + the matching
> `gguf-py` and runs the conversion itself:
> ```powershell
> python training/fetch_llamacpp.py
> powershell -ExecutionPolicy Bypass -File training/export_gguf_manual.ps1
> ```
> It is resumable: it skips the merge/f16/quantize steps that already exist.

Then create the Ollama model:

```bash
ollama create nt-housing-triage -f training/Modelfile
```

> The `FROM` line in `Modelfile` is an **absolute** path. Ollama resolves a
> relative `FROM` against the Modelfile's own directory, so `./training/...`
> silently becomes `training/training/...` and fails with
> `400 Bad Request: invalid model name`.

Point the app at it (defaults shown, already in `.env.example`):

```bash
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=nt-housing-triage
```

The app calls `/api/chat` with `format: "json"` at temperature 0. If Ollama is
unreachable, `lib/parser/fallback.ts` produces the same JSON shape offline — so
the demo never depends on the model being up.

## Files

| file | purpose |
|---|---|
| `generate-dataset.ts` | synthetic report → JSONL (train/eval split) |
| `finetune_gemma4_colab.ipynb` | **Route A** — full train/eval/merge/GGUF on free Colab |
| `finetune_gemma4.py` | **Route B** — unsloth + QLoRA training, optional GGUF export |
| `evaluate_gemma4.py` | field-level F1, base vs fine-tuned |
| `export_gguf.py` | merge LoRA + convert to GGUF standalone |
| `setup-env.ps1` | create the Python 3.11 Unsloth env |
| `download_model.py` | parallel + resumable base-model download (slow links) |
| `fetch_llamacpp.py` | fetch prebuilt llama.cpp + matching `gguf-py` (short paths) |
| `export_gguf_manual.ps1` | resumable GGUF export that avoids Unsloth's long-path bug |
| `after_training.ps1` | optional unattended train → eval → export → shutdown runner |
| `run_eval.ps1` / `create_ollama.ps1` | detached eval / Ollama registration |
| `Modelfile` | Ollama model definition |
| `Modelfile.baseline` | Ollama definition for the un-tuned GGUF (before/after) |
| `requirements.txt` | Python deps |
| `out/` | generated `train.jsonl` / `eval.jsonl` / eval reports |
| `models/` | LoRA adapter and GGUF output (gitignored) |
