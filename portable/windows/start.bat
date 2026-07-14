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
