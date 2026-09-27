# Register the fine-tuned GGUF with Ollama. Detached + logged so a session
# restart can't interrupt it.

$repo = "C:\Users\Admin\Documents\GitHub\nt-warning-blackspot-index\nt-housing-triage"
$o    = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$log  = Join-Path $repo "training\out\ollama_create.log"

Set-Location $repo
"$(Get-Date -Format s)  === ollama create start ===" | Out-File -Append -Encoding utf8 $log
& $o create nt-housing-triage -f "training\Modelfile" 2>&1 | Out-File -Append -Encoding utf8 $log
"$(Get-Date -Format s)  exit=$LASTEXITCODE" | Out-File -Append -Encoding utf8 $log
& $o list 2>&1 | Out-File -Append -Encoding utf8 $log
"$(Get-Date -Format s)  === done ===" | Out-File -Append -Encoding utf8 $log
