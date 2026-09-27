# Detached GGUF export runner (survives session/server restarts).
# Logs to training/out/export.log. Does NOT shut anything down.

$repo = "C:\Users\Admin\Documents\GitHub\nt-warning-blackspot-index\nt-housing-triage"
$py   = "C:\Users\Admin\anaconda3\envs\nt-triage\python.exe"
$log  = Join-Path $repo "training\out\export.log"

Set-Location $repo
"$(Get-Date -Format s)  === export start ===" | Add-Content $log

& $py "training\export_gguf.py" --model "training\models\base" `
    --adapter "training\models\gemma4-e4b-lora" --out "training\models\gguf" *>> $log

"$(Get-Date -Format s)  === export exit=$LASTEXITCODE ===" | Add-Content $log

$gguf = Join-Path $repo "training\models\gguf\unsloth.Q4_K_M.gguf"
if (Test-Path $gguf) {
    "OK: GGUF at $gguf" | Add-Content $log
    $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path $ollama) {
        "$(Get-Date -Format s)  ollama create nt-housing-triage" | Add-Content $log
        & $ollama create nt-housing-triage -f "training\Modelfile" *>> $log
        & $ollama list *>> $log
    }
} else {
    "FAIL: no GGUF produced" | Add-Content $log
}
"$(Get-Date -Format s)  === export runner done ===" | Add-Content $log
