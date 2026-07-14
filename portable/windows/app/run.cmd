@echo off
REM Fallback when vbeyond-api.exe is missing — uses bundled bun.exe + dist
setlocal
cd /d "%~dp0"

if not defined PRISMA_QUERY_ENGINE_LIBRARY (
  set "PRISMA_QUERY_ENGINE_LIBRARY=%~dp0engines\query_engine-windows.dll.node"
)
if not defined PRISMA_SCHEMA_ENGINE_BINARY (
  set "PRISMA_SCHEMA_ENGINE_BINARY=%~dp0engines\schema-engine-windows.exe"
)
if not defined STATIC_DIR set "STATIC_DIR=public"
if not defined NODE_ENV set "NODE_ENV=production"
if not defined UPDATER_MODE set "UPDATER_MODE=portable"

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
