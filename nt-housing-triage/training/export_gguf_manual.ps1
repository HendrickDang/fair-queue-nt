# Manual GGUF export: HF(merged 16-bit) -> f16 GGUF -> Q4_K_M -> ollama create.
# Bypasses Unsloth's broken prebuilt downloader. Safe to re-run (skips finished steps).

$repo    = "C:\Users\Admin\Documents\GitHub\nt-warning-blackspot-index\nt-housing-triage"
$py      = "C:\Users\Admin\anaconda3\envs\nt-triage\python.exe"
$convert = "C:\llamacpp\src\llama.cpp-b11178\convert_hf_to_gguf.py"
$quant   = "C:\llamacpp\bin\llama-quantize.exe"
$merged  = Join-Path $repo "training\models\gguf"
$f16     = Join-Path $merged "model-f16.gguf"
$out     = Join-Path $merged "unsloth.Q4_K_M.gguf"
$log     = Join-Path $repo "training\out\export.log"

function Log($m) { "$(Get-Date -Format s)  $m" | Out-File -Append -Encoding utf8 $log }

Set-Location $repo
Log "=== manual export start ==="

if (-not (Test-Path $f16)) {
    Log "convert -> f16"
    & $py $convert $merged --outtype f16 --outfile $f16 2>&1 | Out-File -Append -Encoding utf8 $log
    Log "convert exit=$LASTEXITCODE"
} else { Log "f16 already present" }

if ((Test-Path $f16) -and -not (Test-Path $out)) {
    Log "quantize -> Q4_K_M"
    & $quant $f16 $out Q4_K_M 2>&1 | Out-File -Append -Encoding utf8 $log
    Log "quantize exit=$LASTEXITCODE"
} elseif (Test-Path $out) { Log "Q4_K_M already present" }

if (Test-Path $out) {
    Log "OK gguf size=$([math]::Round((Get-Item $out).Length/1MB,1)) MB"
    $ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path $ollama) {
        Log "ollama create nt-housing-triage"
        & $ollama create nt-housing-triage -f "training\Modelfile" 2>&1 | Out-File -Append -Encoding utf8 $log
        & $ollama list 2>&1 | Out-File -Append -Encoding utf8 $log
    }
} else {
    Log "FAIL: no GGUF produced"
}
Log "=== manual export done ==="
