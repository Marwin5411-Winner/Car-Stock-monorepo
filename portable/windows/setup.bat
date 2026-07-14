@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM First-time DB migrate. Optional: setup.bat /seed  |  setup.bat /start

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
cd /d "%VB_HOME%\app"

if not exist "prisma\schema.prisma" (
  echo ERROR: app\prisma missing.
  exit /b 1
)

echo Running prisma migrate deploy...
if exist "tools\prisma.exe" (
  tools\prisma.exe migrate deploy
) else if exist "bun.exe" (
  bun.exe x prisma migrate deploy
) else (
  where bun >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Need tools\prisma.exe or bun for migrations.
    exit /b 1
  )
  bun x prisma migrate deploy
)
if errorlevel 1 (
  echo ERROR: migrate deploy failed.
  exit /b 1
)

if "%DO_SEED%"=="1" (
  echo Seeding...
  if exist "bun.exe" (
    bun.exe run prisma\seed.ts
  ) else (
    bun run prisma\seed.ts
  )
)

echo Setup complete.
if "%DO_START%"=="1" (
  call "%VB_HOME%\start.bat"
)
exit /b 0
