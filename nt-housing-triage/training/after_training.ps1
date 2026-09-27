# Runs after the fine-tune finishes, unattended:
#   eval (base + fine-tuned) -> merge/export GGUF -> ollama create -> shutdown
#
# Launched detached by the agent so it survives a session/server restart:
#   Start-Process powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass",
#       "-File","...\after_training.ps1" -WindowStyle Hidden
#
# Safety: it only powers off if the LoRA adapter AND the GGUF were produced.
# On any failure it logs and leaves the machine on for inspection.

param(
    [string]$Repo = "C:\Users\Admin\Documents\GitHub\nt-warning-blackspot-index\nt-housing-triage",
    [string]$Py   = "C:\Users\Admin\anaconda3\envs\nt-triage\python.exe",
    [int]$EvalLimit = 150,
    [int]$ShutdownDelaySec = 120,
    [switch]$NoShutdown
)

$ErrorActionPreference = "Continue"
Set-Location $Repo
$log = Join-Path $Repo "training\out\after_training.log"
New-Item -ItemType Directory -Force -Path (Join-Path $Repo "training\out") | Out-Null

function Log([string]$m) {
    $line = "$(Get-Date -Format s)  $m"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

Log "=== after_training start (repo=$Repo) ==="

# ---------------------------------------------------------------- wait for train
$deadline = (Get-Date).AddHours(6)
while ((Get-Date) -lt $deadline) {
    $running = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'finetune_gemma4' }
    if (-not $running) { break }
    Start-Sleep -Seconds 30
}
Log "training process no longer running"

$adapter = Join-Path $Repo "training\models\gemma4-e4b-lora\adapter_config.json"
if (-not (Test-Path $adapter)) {
    Log "ERROR: adapter not found at $adapter - training did not finish. NOT shutting down."
    Log "=== after_training aborted ==="
    exit 1
}
Log "adapter found"

# ---------------------------------------------------------------------- evaluate
Log "--- eval: base model ---"
& $Py "training\evaluate_gemma4.py" --model "training\models\base" `
    --limit $EvalLimit --out "training\out\eval-base.json" *>> $log
Log "eval base exit=$LASTEXITCODE"

Log "--- eval: fine-tuned ---"
& $Py "training\evaluate_gemma4.py" --model "training\models\base" `
    --adapter "training\models\gemma4-e4b-lora" `
    --limit $EvalLimit --out "training\out\eval-finetuned.json" *>> $log
Log "eval tuned exit=$LASTEXITCODE"

# ------------------------------------------------------------------ export gguf
Log "--- export GGUF (Q4_K_M) ---"
& $Py "training\export_gguf.py" --model "training\models\base" `
    --adapter "training\models\gemma4-e4b-lora" `
    --out "training\models\gguf" *>> $log
Log "export exit=$LASTEXITCODE"

$gguf = Join-Path $Repo "training\models\gguf\unsloth.Q4_K_M.gguf"
if (-not (Test-Path $gguf)) {
    Log "ERROR: GGUF not produced at $gguf. NOT shutting down."
    Log "=== after_training aborted ==="
    exit 1
}
Log "GGUF produced: $gguf"

# ---------------------------------------------------------------- ollama create
$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
if (-not (Test-Path $ollama)) {
    $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
}
if ($ollama -and (Test-Path $ollama)) {
    Log "--- ollama create (nt-housing-triage) ---"
    & $ollama create nt-housing-triage -f "training\Modelfile" *>> $log
    Log "ollama create exit=$LASTEXITCODE"
    & $ollama list *>> $log
} else {
    Log "WARN: ollama not found - skipping 'ollama create'. GGUF is ready at $gguf"
}

# -------------------------------------------------------------------- shutdown
if ($NoShutdown) {
    Log "NoShutdown set - leaving machine on."
} else {
    Log "Pipeline complete - shutting down in $ShutdownDelaySec s."
    shutdown.exe /s /t $ShutdownDelaySec /c "NT triage fine-tune complete - powering off"
}
Log "=== after_training done ==="
