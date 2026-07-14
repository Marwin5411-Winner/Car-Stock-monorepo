@echo off
REM Fallback when vbeyond-api.exe is missing — uses bundled bun.exe + dist
REM Manual troubleshooting only: start.bat launches bun.exe directly and never calls this file.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM Load config\.env (start.bat does this too — without it DATABASE_URL/JWT_SECRET
REM are unset and the API exits almost instantly, which is why double-clicking this
REM used to flash a console window and close it before you could read the error).
if exist "..\config\.env" (
  for /f "usebackq tokens=1,* delims== eol=#" %%A in ("..\config\.env") do (
    set "line=%%A"
    if not "!line!"=="" if not "!line:~0,1!"=="#" (
      set "%%A=%%B"
    )
  )
)

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
  set "EC=%ERRORLEVEL%"
  if not "%EC%"=="0" (
    echo.
    echo run.cmd exited with code %EC% — see the output above.
    pause
  )
  exit /b %EC%
)

where bun >nul 2>&1
if %ERRORLEVEL%==0 (
  bun run dist\index.js
  set "EC=%ERRORLEVEL%"
  if not "%EC%"=="0" (
    echo.
    echo run.cmd exited with code %EC% — see the output above.
    pause
  )
  exit /b %EC%
)

echo ERROR: Neither vbeyond-api.exe nor bun.exe found in app\
pause
exit /b 1
