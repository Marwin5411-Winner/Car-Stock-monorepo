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

if exist "%PIDFILE%" (
  set /p PID=<"%PIDFILE%"
  if defined PID (
    echo Stopping PID !PID!
    taskkill /PID !PID! /T /F >nul 2>&1
  )
)

REM Fallbacks by image name (portable package)
taskkill /IM vbeyond-api.exe /T /F >nul 2>&1
REM Do not kill all bun.exe on shared machines if avoidable — only if lock present
if exist "%LOCK%" (
  taskkill /IM bun.exe /T /F >nul 2>&1
)

del "%PIDFILE%" 2>nul
del "%LOCK%" 2>nul
echo Stopped.
exit /b 0
