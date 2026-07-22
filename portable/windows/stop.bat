@echo off
setlocal EnableExtensions
cd /d "%~dp0"

REM Prefer stop-app.ps1 (CIM path + app\ scan). Fallback message if PowerShell missing.
if not exist "%~dp0stop-app.ps1" (
  echo ERROR: stop-app.ps1 missing from package.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-app.ps1"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo stop.bat could not fully stop the app.
  echo   - Task Manager: end vbeyond-api.exe
  echo   - Admin: Get-Service VBeyondCarStock ^| Stop-Service -Force
  exit /b %EC%
)
exit /b 0
