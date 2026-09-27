@echo off
setlocal EnableExtensions EnableDelayedExpansion
title NT Housing Triage - one-click server
cd /d "%~dp0"

set "PORT=3000"
set "TUNLOG=%TEMP%\nt-triage-tunnel.log"

echo ============================================================
echo    NT Housing Triage  -  one-click server + public URL
echo ============================================================
echo.

REM ---- locate cloudflared -------------------------------------------
set "CLOUDFLARED="
for /f "delims=" %%i in ('where cloudflared 2^>nul') do (
  if not defined CLOUDFLARED set "CLOUDFLARED=%%i"
)
if not defined CLOUDFLARED if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CLOUDFLARED=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined CLOUDFLARED (
  echo [X] cloudflared was not found.
  echo     Install it once by running this in a terminal:
  echo.
  echo         winget install Cloudflare.cloudflared
  echo.
  goto :end
)

REM ---- dependencies ------------------------------------------------
if not exist "node_modules" (
  echo [*] First run: installing dependencies ^(this can take a few minutes^)...
  call npm install
  if errorlevel 1 (
    echo [X] npm install failed.
    goto :end
  )
)

REM ---- make sure the app is running --------------------------------
call :portListening %PORT%
if "!LISTENING!"=="1" (
  echo [=] App is already running on port %PORT% - reusing it.
) else (
  echo [*] Starting the app on http://localhost:%PORT% ...
  start "NT app - do not close" cmd /k "npm run dev"
  <nul set /p "=      waiting for the app to be ready"
  call :waitPort %PORT% 90
  echo.
  if "!READY!"=="0" (
    echo [X] The app did not start on port %PORT% within 90 seconds.
    goto :end
  )
  echo [+] App is up.
)

REM ---- open the public tunnel --------------------------------------
echo [*] Opening the public internet tunnel ...
if exist "%TUNLOG%" del "%TUNLOG%" >nul 2>&1
start "NT tunnel - do not close" cmd /c ""%CLOUDFLARED%" tunnel --url http://localhost:%PORT% --no-autoupdate > "%TUNLOG%" 2>&1"

<nul set /p "=      waiting for the public URL"
call :waitUrl 60
echo.

if not defined PUBURL (
  echo [X] Timed out waiting for the public URL. Tunnel output was:
  echo ------------------------------------------------------------
  if exist "%TUNLOG%" type "%TUNLOG%"
  echo ------------------------------------------------------------
  goto :end
)

echo.
echo ============================================================
echo    PUBLIC URL:  !PUBURL!
echo ============================================================
echo.
echo    Local URL :  http://localhost:%PORT%
echo.
echo    Keep the "NT app" and "NT tunnel" windows OPEN while
echo    sharing the link. Closing them stops the public site.
echo.
start "" "!PUBURL!"
echo    Opening the public URL in your browser...
goto :end

REM =================================================================
:portListening
set "LISTENING=0"
for /f %%c in ('powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %~1 -State Listen -ErrorAction SilentlyContinue) {1} else {0}"') do set "LISTENING=%%c"
exit /b

:waitPort
set "READY=0"
set /a _wp=0
:waitPortLoop
call :portListening %~1
if "!LISTENING!"=="1" (
  set "READY=1"
  goto :waitPortDone
)
set /a _wp+=1
if !_wp! GEQ %~2 goto :waitPortDone
<nul set /p "=."
ping -n 2 127.0.0.1 >nul
goto :waitPortLoop
:waitPortDone
exit /b

:waitUrl
set "PUBURL="
set /a _wu=0
:waitUrlLoop
if defined PUBURL goto :waitUrlDone
set /a _wu+=1
if !_wu! GTR %~1 goto :waitUrlDone
if exist "%TUNLOG%" (
  findstr /C:"trycloudflare.com" "%TUNLOG%" >nul 2>&1 && goto :extractUrl
)
<nul set /p "=."
ping -n 2 127.0.0.1 >nul
goto :waitUrlLoop
:extractUrl
for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command "$m = Select-String -Path '%TUNLOG%' -Pattern 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' -List; if ($m) { $m.Matches[0].Value }"`) do set "PUBURL=%%u"
goto :waitUrlLoop
:waitUrlDone
exit /b

:end
echo.
pause
