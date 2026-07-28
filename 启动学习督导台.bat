@echo off
setlocal
title Study Supervisor

cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\pdfjs-dist\package.json" (
  echo Installing local dependencies for the first launch...
  call npm.cmd ci
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

set "PORT=4174"
set "APP_URL=http://127.0.0.1:4174/#daily-report"

powershell.exe -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 'http://127.0.0.1:4174/api/kimi/status'; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo Study Supervisor is already running on port 4174.
  echo Opening Daily Report inside the existing app...
  start "" "%APP_URL%"
  exit /b 0
)

powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 4174 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [ERROR] Port 4174 is used by another application.
  echo Close that application, then run this file again.
  pause
  exit /b 1
)

echo Starting Study Supervisor...
echo Browser URL: %APP_URL%
echo Daily Report, classroom and whiteboard share this one local service.
echo Keep this window open. Close it to stop the local service.
start "" "%APP_URL%"
node server.js

echo.
if errorlevel 1 (
  echo [ERROR] The local service stopped unexpectedly.
) else (
  echo Study Supervisor has stopped.
)
pause
endlocal
