@echo off
REM Fallback runner when vbeyond-api.exe is not present.
REM Expects portable bun.exe next to this script, or bun on PATH.
setlocal
cd /d "%~dp0"

if exist "%~dp0bun.exe" (
  "%~dp0bun.exe" run dist\index.js
  exit /b %ERRORLEVEL%
)

where bun >nul 2>&1
if %ERRORLEVEL%==0 (
  bun run dist\index.js
  exit /b %ERRORLEVEL%
)

echo ERROR: Neither vbeyond-api.exe nor bun.exe found in app\
exit /b 1
