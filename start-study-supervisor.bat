@echo off
setlocal
cd /d "%~dp0"
set "PORT=4174"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Please install Node.js 20 or newer.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:%PORT%"
node server.js
if errorlevel 1 (
  echo.
  echo Study Supervisor failed to start. Review the message above.
  pause
)
