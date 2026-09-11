@echo off
cd /d %~dp0
if not exist node_modules (
  call npm ci --ignore-scripts --no-audit --no-fund
  if errorlevel 1 exit /b 1
)
call npm run dev
