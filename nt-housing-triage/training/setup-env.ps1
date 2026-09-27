# Create an isolated Python env for the Gemma 4 E4B QLoRA fine-tune.
#
#   powershell -ExecutionPolicy Bypass -File training/setup-env.ps1
#   conda activate nt-triage
#   python training/finetune_gemma4.py --max-steps 20   # smoke test
#
# Unsloth needs Python 3.10-3.12 (the base Anaconda env here is 3.9, which is
# too old for the Gemma 4 / transformers stack).

param(
    [string]$EnvName = "nt-triage",
    [string]$PythonVersion = "3.11"
)

$ErrorActionPreference = "Stop"

Write-Host "==> Checking NVIDIA driver" -ForegroundColor Cyan
if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
    throw "nvidia-smi not found. Install/repair the NVIDIA driver before training."
}
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader

Write-Host "==> Creating conda env '$EnvName' (python $PythonVersion)" -ForegroundColor Cyan
conda create -y -n $EnvName "python=$PythonVersion"

Write-Host "==> Installing Unsloth (pulls CUDA torch + transformers + trl)" -ForegroundColor Cyan
conda run -n $EnvName python -m pip install --upgrade pip
conda run -n $EnvName python -m pip install unsloth datasets

Write-Host "==> Verifying GPU is visible to torch" -ForegroundColor Cyan
conda run -n $EnvName python -c "import torch; print('torch', torch.__version__); print('cuda', torch.cuda.is_available()); print('gpu', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'none')"

Write-Host ""
Write-Host "Done. Next:" -ForegroundColor Green
Write-Host "  conda activate $EnvName"
Write-Host "  npm run training:generate -- 3000"
Write-Host "  python training/finetune_gemma4.py --export-gguf"
