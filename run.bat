@echo off
cd /d %~dp0
node tools\ensure-deps.mjs
if errorlevel 1 exit /b 1
call npm run dev
