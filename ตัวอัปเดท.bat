@echo off
chcp 65001 >nul
title Car Stock - Quick Update

echo ========================================
echo   Car Stock - Quick Update Script
echo ========================================
echo.

:: Step 1: Git pull
echo [1/3] Pulling latest code...
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo ERROR: git pull failed!
    pause
    exit /b 1
)
echo      Done.
echo.

:: Step 2: Rebuild containers
echo [2/3] Rebuilding Docker containers...
docker compose build api web
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker build failed!
    pause
    exit /b 1
)
echo      Done.
echo.

:: Step 3: Restart services (includes gotenberg for PDF generation)
echo [3/3] Restarting services...
docker compose up -d api web gotenberg
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to start containers!
    pause
    exit /b 1
)
echo      Done.
echo.

echo ========================================
echo   Update complete!
echo ========================================
echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

:: Health check
curl -sf http://localhost:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo API:  OK
) else (
    echo API:  Not ready yet (may need a few more seconds)
)

curl -sf http://localhost/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Web:  OK
) else (
    echo Web:  Not ready yet (may need a few more seconds)
)

echo.
pause
