@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Launcher so double-click works (ExecutionPolicy Bypass) and errors stay visible.
REM Still requires Administrator (script checks and pauses with instructions).

echo Running install-service.ps1 ...
echo If UAC prompts, approve Administrator access.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-service.ps1" %*
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo install-service failed with exit code %EC%
  pause
)
exit /b %EC%
