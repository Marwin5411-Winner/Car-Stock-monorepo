@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo Running uninstall-service.ps1 ...
echo If UAC prompts, approve Administrator access.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-service.ps1" %*
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo uninstall-service failed with exit code %EC%
  pause
)
exit /b %EC%
