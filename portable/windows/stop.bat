@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
set "VB_HOME=%CD%"
set "LOCK=%VB_HOME%\data\status\app.lock"
set "PIDFILE=%VB_HOME%\data\status\app.pid"

REM Prefer Windows Service if installed
sc query VBeyondCarStock >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Stopping service VBeyondCarStock...
  net stop VBeyondCarStock >nul 2>&1
)

REM Kill only the PID recorded at start, and only if its image path is under VB_HOME\app.
REM Never taskkill by image name alone (unsafe on shared hosts / multi-instance).
if exist "%PIDFILE%" (
  set /p PID=<"%PIDFILE%"
  if defined PID (
    echo Stopping PID !PID! ^(path-checked under app\^)...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "$pidNum = 0; if (-not [int]::TryParse('!PID!', [ref]$pidNum)) { exit 0 }; $root = [IO.Path]::GetFullPath('%VB_HOME%\app'); try { $p = Get-Process -Id $pidNum -ErrorAction Stop } catch { exit 0 }; $path = $p.Path; if (-not $path) { Write-Host 'PID has no path; skipping kill'; exit 0 }; if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { Write-Host \"Refusing to kill PID $pidNum outside app: $path\"; exit 0 }; Start-Process -FilePath 'taskkill.exe' -ArgumentList @('/PID', \"$pidNum\", '/T', '/F') -Wait -NoNewWindow -WindowStyle Hidden | Out-Null; exit 0"
  )
)

del "%PIDFILE%" 2>nul
del "%LOCK%" 2>nul
echo Stopped.
exit /b 0
