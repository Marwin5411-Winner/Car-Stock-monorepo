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

REM curl.exe only ships with Windows 10 1803+ / Server 2019. On older boxes a missing curl
REM made every health probe "fail" and start.bat killed an app that had started fine.
set "HAVE_CURL=1"
where curl >nul 2>&1
if errorlevel 1 set "HAVE_CURL=0"

if not exist "%VB_HOME%\config\.env" (
  echo ERROR: config\.env not found.
  echo Copy config\.env.example to config\.env and set DATABASE_URL / JWT_SECRET.
  call :pause_if_console
  exit /b 1
)

if not exist "%VB_HOME%\app\VERSION" (
  echo ERROR: app\VERSION missing. Incomplete package.
  call :pause_if_console
  exit /b 1
)

if not exist "%VB_HOME%\data\status" mkdir "%VB_HOME%\data\status"
if not exist "%VB_HOME%\data\logs\app" mkdir "%VB_HOME%\data\logs\app"

set "LOCK=%VB_HOME%\data\status\app.lock"
set "PIDFILE=%VB_HOME%\data\status\app.pid"

if /I "%MODE%"=="check" goto :check_only

REM Single-instance: treat lock as stale unless app.pid is a live process under VB_HOME\app
if exist "%LOCK%" (
  set "STALE=1"
  if exist "%PIDFILE%" (
    set /p OLD_PID=<"%PIDFILE%"
    if defined OLD_PID (
      powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$pidNum = [int]'!OLD_PID!'; try { $p = Get-Process -Id $pidNum -ErrorAction Stop; $path = $p.Path; if (-not $path) { exit 1 }; $root = [IO.Path]::GetFullPath('%VB_HOME%\app'); if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { exit 0 } else { exit 1 } } catch { exit 1 }"
      if !ERRORLEVEL! equ 0 set "STALE=0"
    )
  )
  if "!STALE!"=="0" (
    echo ERROR: App appears to be running ^(PID in data\status\app.pid^). Use stop.bat first.
    exit /b 2
  )
  echo Clearing stale app.lock / app.pid
  del "%LOCK%" 2>nul
  del "%PIDFILE%" 2>nul
)

echo. > "%LOCK%"

REM Load key=value from config\.env into process environment
for /f "usebackq tokens=1,* delims== eol=#" %%A in ("%VB_HOME%\config\.env") do (
  set "line=%%A"
  if not "!line!"=="" if not "!line:~0,1!"=="#" (
    set "%%A=%%B"
  )
)

REM Fail here rather than 60s later at the health check: a UTF-8 BOM (Notepad's default
REM "UTF-8 with BOM" save) turns the first key into an unusable variable name, and the API
REM then exits within a second with no window to read. Note: a "!" in a password is eaten
REM by delayed expansion — use a password without "!" or "%".
if not defined DATABASE_URL (
  echo ERROR: DATABASE_URL not found in config\.env
  echo   - save config\.env as UTF-8 WITHOUT BOM
  echo   - one KEY=VALUE per line, no quotes, no spaces around "="
  del "%LOCK%" 2>nul
  call :pause_if_console
  exit /b 1
)
if not defined JWT_SECRET (
  echo ERROR: JWT_SECRET not set in config\.env ^(random string, 32+ characters^)
  del "%LOCK%" 2>nul
  call :pause_if_console
  exit /b 1
)
if /I "%JWT_SECRET%"=="your-secret-key-change-in-production" (
  echo ERROR: JWT_SECRET is still the placeholder. Set a random string ^(32+ chars^) in config\.env
  del "%LOCK%" 2>nul
  call :pause_if_console
  exit /b 1
)

set "VB_HOME=%CD%"
set "UPDATER_MODE=portable"
if not defined STATIC_DIR set "STATIC_DIR=public"
if not defined NODE_ENV set "NODE_ENV=production"
if not defined CORS_ORIGIN set "CORS_ORIGIN=http://localhost:%PORT%"
if not defined PORT set "PORT=3001"
REM Outside app\, so pino's rolling logs survive an update replacing the app directory.
if not defined LOG_DIR set "LOG_DIR=%VB_HOME%\data\logs\app"

REM Prisma engines shipped with the package (required for compiled API)
set "PRISMA_QUERY_ENGINE_LIBRARY=%VB_HOME%\app\engines\query_engine-windows.dll.node"
set "PRISMA_SCHEMA_ENGINE_BINARY=%VB_HOME%\app\engines\schema-engine-windows.exe"
set "PRISMA_CLI_QUERY_ENGINE_TYPE=library"

cd /d "%VB_HOME%\app"

REM Prefer compiled exe; else launch bundled bun.exe directly (not run.cmd) so PID path is under app\
set "APP_ARGS="
if exist "vbeyond-api.exe" (
  set "APP_CMD=%VB_HOME%\app\vbeyond-api.exe"
) else if exist "bun.exe" (
  set "APP_CMD=%VB_HOME%\app\bun.exe"
  set "APP_ARGS=run dist\index.js"
) else (
  echo ERROR: No vbeyond-api.exe or bun.exe in app\
  del "%LOCK%" 2>nul
  exit /b 1
)

echo Starting VBeyond ^(mode=%MODE%^)...
echo PORT=%PORT%  VB_HOME=%VB_HOME%

if /I "%MODE%"=="service" (
  REM NSSM / service: start child, record its real PID, wait in foreground
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; $exe='%APP_CMD%'; $wd='%VB_HOME%\app'; $stdout='%VB_HOME%\data\logs\app\stdout.log'; $stderr='%VB_HOME%\data\logs\app\stderr.log'; $pidFile='%PIDFILE%'; $argLine='%APP_ARGS%'; $sp = @{ FilePath=$exe; WorkingDirectory=$wd; PassThru=$true; NoNewWindow=$true; RedirectStandardOutput=$stdout; RedirectStandardError=$stderr }; if ($argLine.Trim().Length -gt 0) { $sp['ArgumentList'] = $argLine.Split(' ', [StringSplitOptions]::RemoveEmptyEntries) }; $p = Start-Process @sp; Set-Content -LiteralPath $pidFile -Value $p.Id -Encoding ascii; $p.WaitForExit(); if ($null -eq $p.ExitCode) { exit 1 }; exit $p.ExitCode"
  set "EC=!ERRORLEVEL!"
  del "%LOCK%" 2>nul
  del "%PIDFILE%" 2>nul
  exit /b !EC!
)

REM Console: Start-Process -PassThru records the real child PID (not a global tasklist guess)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $exe='%APP_CMD%'; $wd='%VB_HOME%\app'; $stdout='%VB_HOME%\data\logs\app\stdout.log'; $stderr='%VB_HOME%\data\logs\app\stderr.log'; $pidFile='%PIDFILE%'; $argLine='%APP_ARGS%'; $sp = @{ FilePath=$exe; WorkingDirectory=$wd; PassThru=$true; WindowStyle='Hidden'; RedirectStandardOutput=$stdout; RedirectStandardError=$stderr }; if ($argLine.Trim().Length -gt 0) { $sp['ArgumentList'] = $argLine.Split(' ', [StringSplitOptions]::RemoveEmptyEntries) }; $p = Start-Process @sp; Set-Content -LiteralPath $pidFile -Value $p.Id -Encoding ascii; exit 0"
if errorlevel 1 (
  echo ERROR: Failed to start process.
  del "%LOCK%" 2>nul
  del "%PIDFILE%" 2>nul
  exit /b 1
)

set "APP_PID="
if exist "%PIDFILE%" set /p APP_PID=<"%PIDFILE%"

set /a ATTEMPT=0
:health_loop
set /a ATTEMPT+=1

REM If the API already exited (bad DATABASE_URL, missing JWT_SECRET, port in use) there is
REM nothing to wait for — report it now instead of after a silent minute.
if defined APP_PID (
  tasklist /FI "PID eq !APP_PID!" 2>nul | find "!APP_PID!" >nul
  if errorlevel 1 (
    echo ERROR: API exited before it became healthy.
    del "%LOCK%" 2>nul
    del "%PIDFILE%" 2>nul
    call :show_logs
    call :pause_if_console
    exit /b 3
  )
)

call :probe_health
if !ERRORLEVEL! equ 0 (
  echo Health OK. Open http://127.0.0.1:%PORT%/
  echo Running. Use stop.bat to stop.
  exit /b 0
)
if !ATTEMPT! geq 30 (
  echo ERROR: Health check failed after 60s ^(Postgres down, bad DATABASE_URL, or port blocked^).
  call "%VB_HOME%\stop.bat"
  call :show_logs
  call :pause_if_console
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
call :probe_health
if errorlevel 1 (
  echo Health check failed ^(app down, or database unreachable^)
  exit /b 4
)
echo Health OK on http://127.0.0.1:%PORT%/
exit /b 0

REM Returns 0 only on HTTP 200. /health answers 503 when the database is unreachable, so a
REM DB-less app can no longer pass as started.
:probe_health
if "%HAVE_CURL%"=="1" (
  curl -sf "http://127.0.0.1:%PORT%/health" >nul 2>&1
  exit /b !ERRORLEVEL!
)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/health' -UseBasicParsing -TimeoutSec 3; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; exit 1"
exit /b !ERRORLEVEL!

REM Dump recent process logs so double-click users can read the real crash reason
REM instead of a window that flashes closed (common "ขึ้นแล้วดับ" report).
:show_logs
echo.
if exist "%VB_HOME%\app\VERSION" (
  set /p APP_VER=<"%VB_HOME%\app\VERSION"
  echo App version: !APP_VER!
)
echo ---------- data\logs\app\stderr.log ^(last 40 lines^) ----------
if exist "%VB_HOME%\data\logs\app\stderr.log" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-Content -LiteralPath '%VB_HOME%\data\logs\app\stderr.log' -Tail 40 -ErrorAction SilentlyContinue"
) else (
  echo ^(no stderr.log yet^)
)
echo ---------- data\logs\app\stdout.log ^(last 20 lines^) ----------
if exist "%VB_HOME%\data\logs\app\stdout.log" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Get-Content -LiteralPath '%VB_HOME%\data\logs\app\stdout.log' -Tail 20 -ErrorAction SilentlyContinue"
) else (
  echo ^(no stdout.log yet^)
)
echo ---------------------------------------------------------------
echo Also check: PostgreSQL service running? JWT_SECRET set? config\.env UTF-8 without BOM?
echo.
exit /b 0

:pause_if_console
if /I "%MODE%"=="service" exit /b 0
if /I "%MODE%"=="check" exit /b 0
echo Press any key to close...
pause >nul
exit /b 0
