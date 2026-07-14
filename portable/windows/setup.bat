@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM First-time DB migrate (offline-capable Prisma engines shipped in app\engines)
REM Optional: setup.bat /seed  |  setup.bat /start

cd /d "%~dp0"
set "VB_HOME=%CD%"
set "DO_SEED=0"
set "DO_START=0"
if /I "%~1"=="/seed" set "DO_SEED=1"
if /I "%~2"=="/seed" set "DO_SEED=1"
if /I "%~1"=="/start" set "DO_START=1"
if /I "%~2"=="/start" set "DO_START=1"

if not exist "%VB_HOME%\config\.env" (
  echo ERROR: config\.env not found. Copy config\.env.example first.
  exit /b 1
)

for /f "usebackq tokens=1,* delims== eol=#" %%A in ("%VB_HOME%\config\.env") do (
  set "line=%%A"
  if not "!line!"=="" if not "!line:~0,1!"=="#" (
    set "%%A=%%B"
  )
)

set "VB_HOME=%CD%"
set "PRISMA_QUERY_ENGINE_LIBRARY=%VB_HOME%\app\engines\query_engine-windows.dll.node"
set "PRISMA_SCHEMA_ENGINE_BINARY=%VB_HOME%\app\engines\schema-engine-windows.exe"
set "PRISMA_CLI_QUERY_ENGINE_TYPE=library"

if not exist "%VB_HOME%\app\prisma\schema.prisma" (
  echo ERROR: app\prisma missing.
  exit /b 1
)

echo Running prisma migrate deploy...
cd /d "%VB_HOME%\app"

if exist "bun.exe" (
  if exist "tools\migrate\node_modules\prisma" (
    "bun.exe" "%VB_HOME%\app\tools\migrate\node_modules\prisma\build\index.js" migrate deploy --schema="%VB_HOME%\app\prisma\schema.prisma"
  ) else (
    "bun.exe" x prisma migrate deploy --schema="%VB_HOME%\app\prisma\schema.prisma"
  )
) else (
  where bun >nul 2>&1
  if errorlevel 1 (
    echo ERROR: app\bun.exe missing. Re-pack the portable package.
    exit /b 1
  )
  bun x prisma migrate deploy --schema="%VB_HOME%\app\prisma\schema.prisma"
)

if errorlevel 1 (
  echo ERROR: migrate deploy failed.
  exit /b 1
)

if "%DO_SEED%"=="1" (
  echo Seeding...
  if exist "bun.exe" (
    if exist "prisma\seed.ts" (
      "bun.exe" run "prisma\seed.ts"
    ) else (
      echo WARN: prisma\seed.ts not found — skip seed
    )
  )
)

echo Setup complete.
if "%DO_START%"=="1" (
  call "%VB_HOME%\start.bat"
)
exit /b 0
