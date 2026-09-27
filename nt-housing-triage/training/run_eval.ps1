# Base vs fine-tuned field-level F1. Detached + logged.
$repo = "C:\Users\Admin\Documents\GitHub\nt-warning-blackspot-index\nt-housing-triage"
$py   = "C:\Users\Admin\anaconda3\envs\nt-triage\python.exe"
$log  = Join-Path $repo "training\out\eval.log"

Set-Location $repo
"$(Get-Date -Format s)  === eval start ===" | Out-File -Append -Encoding utf8 $log

"--- base ---" | Out-File -Append -Encoding utf8 $log
& $py "training\evaluate_gemma4.py" --model "training\models\base" `
    --limit 150 --out "training\out\eval-base.json" 2>&1 | Out-File -Append -Encoding utf8 $log
"base exit=$LASTEXITCODE" | Out-File -Append -Encoding utf8 $log

"--- fine-tuned ---" | Out-File -Append -Encoding utf8 $log
& $py "training\evaluate_gemma4.py" --model "training\models\base" `
    --adapter "training\models\gemma4-e4b-lora" `
    --limit 150 --out "training\out\eval-finetuned.json" 2>&1 | Out-File -Append -Encoding utf8 $log
"tuned exit=$LASTEXITCODE" | Out-File -Append -Encoding utf8 $log

"$(Get-Date -Format s)  === eval done ===" | Out-File -Append -Encoding utf8 $log
