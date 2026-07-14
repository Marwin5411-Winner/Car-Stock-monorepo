@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM VBeyond portable — start API (+ static web)
REM Usage: start.bat [ /service | /console | /check ]

cd /d "%~dp0"
set "VB_HOME=%CD%"
if not defined PORT set "PORT=3001"

set "MODE=console"
if /I "%~1"=="/service" set "MODE=service"
if /I "%~1"=="/console" set "MODE=console"
if /I "%~1"=="/check" set "MODE=check"

if not exist "%VB_HOME%\config\.env" (
  echo ERROR: config\.env not found.
  echo Copy config\.env.example to config\.env and set DATABASE_URL / JWT_SECRET.
  exit /b 1
)

if not exist "%VB_HOME%\app\VERSION" (
  echo ERROR: app\VERSION missing. Incomplete package.
  exit /b 1
)

if not exist "%VB_HOME%\data\status" mkdir "%VB_HOME%\data\status"
if not exist "%VB_HOME%\data\logs\app" mkdir "%VB_HOME%\data\logs\app"

set "LOCK=%VB_HOME%\data\status\app.lock"
set "PIDFILE=%VB_HOME%\data\status\app.pid"

if /I "%MODE%"=="check" goto :check_only

if exist "%LOCK%" (
  echo ERROR: App appears to be running ^(lock: data\status\app.lock^). Use stop.bat first.
  exit /b 2
)

echo. > "%LOCK%"

REM Load key=value from config\.env into process environment
for /f "usebackq tokens=1,* delims== eol=#" %%A in ("%VB_HOME%\config\.env") do (
  set "line=%%A"
  if not "!line!"=="" if not "!line:~0,1!"=="#" (
    set "%%A=%%B"
  )
)

set "VB_HOME=%CD%"
set "UPDATER_MODE=portable"
if not defined STATIC_DIR set "STATIC_DIR=public"
if not defined NODE_ENV set "NODE_ENV=production"
if not defined CORS_ORIGIN set "CORS_ORIGIN=http://localhost:%PORT%"
if not defined PORT set "PORT=3001"

REM Prisma engines shipped with the package (required for compiled API)
set "PRISMA_QUERY_ENGINE_LIBRARY=%VB_HOME%\app\engines\query_engine-windows.dll.node"
set "PRISMA_SCHEMA_ENGINE_BINARY=%VB_HOME%\app\engines\schema-engine-windows.exe"
set "PRISMA_CLI_QUERY_ENGINE_TYPE=library"

cd /d "%VB_HOME%\app"

if exist "vbeyond-api.exe" (
  set "APP_CMD=%VB_HOME%\app\vbeyond-api.exe"
) else if exist "run.cmd" (
  set "APP_CMD=%VB_HOME%\app\run.cmd"
) else (
  echo ERROR: No vbeyond-api.exe or run.cmd in app\
  del "%LOCK%" 2>nul
  exit /b 1
)

echo Starting VBeyond ^(mode=%MODE%^)...
echo PORT=%PORT%  VB_HOME=%VB_HOME%

if /I "%MODE%"=="service" (
  REM NSSM / service: stay in foreground
  "%APP_CMD%" >> "%VB_HOME%\data\logs\app\stdout.log" 2>> "%VB_HOME%\data\logs\app\stderr.log"
  set "EC=!ERRORLEVEL!"
  del "%LOCK%" 2>nul
  del "%PIDFILE%" 2>nul
  exit /b !EC!
)

REM Console: start process in background, write PID, wait for health
start /b "" "%APP_CMD%" >> "%VB_HOME%\data\logs\app\stdout.log" 2>> "%VB_HOME%\data\logs\app\stderr.log"
timeout /t 2 /nobreak >nul

for /f "tokens=2" %%P in ('tasklist /FI "IMAGENAME eq vbeyond-api.exe" /NH 2^>nul') do (
  echo %%P> "%PIDFILE%"
  goto :pid_done
)
for /f "tokens=2" %%P in ('tasklist /FI "IMAGENAME eq bun.exe" /NH 2^>nul') do (
  echo %%P> "%PIDFILE%"
  goto :pid_done
)
:pid_done

set /a ATTEMPT=0
:health_loop
set /a ATTEMPT+=1
curl -sf "http://127.0.0.1:%PORT%/health" >nul 2>&1
if !ERRORLEVEL! equ 0 (
  echo Health OK. Open http://127.0.0.1:%PORT%/
  echo Running. Use stop.bat to stop.
  exit /b 0
)
if !ATTEMPT! geq 30 (
  echo ERROR: Health check failed after 60s. See data\logs\app\
  call "%VB_HOME%\stop.bat"
  exit /b 4
)
timeout /t 2 /nobreak >nul
goto :health_loop

:check_only
for /f "usebackq tokens=1,* delims== eol=#" %%A in ("%VB_HOME%\config\.env") do (
  set "line=%%A"
  if not "!line!"=="" if not "!line:~0,1!"=="#" (
    set "%%A=%%B"
  )
)
if not defined PORT set "PORT=3001"
curl -sf "http://127.0.0.1:%PORT%/health"
if errorlevel 1 (
  echo Health check failed
  exit /b 4
)
echo.
exit /b 0
