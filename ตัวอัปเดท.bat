@echo off
chcp 65001 >nul
title Car Stock - Quick Update
color 0F

:: ──────────────────────────────────────────────
:: Self-update: git pull first, then re-launch
:: this script from disk so the NEW version runs.
:: ──────────────────────────────────────────────
if "%~1"=="--run" goto :MAIN

echo ==========================================
echo   Car Stock - Preparing update...
echo ==========================================
echo.

:: Save commit before pull (for "already up to date" check later)
for /f "delims=" %%i in ('git rev-parse --short HEAD') do set BEFORE_COMMIT=%%i

echo   Pulling latest code...
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo ERROR: git pull failed!
    pause
    exit /b 1
)

:: Re-launch ourselves — Windows reads the NEW file from disk
call "%~f0" --run %BEFORE_COMMIT%
exit /b %ERRORLEVEL%

:: ──────────────────────────────────────────────
:: Main update logic (runs as the LATEST version)
:: ──────────────────────────────────────────────
:MAIN
set CURRENT_COMMIT=%~2

echo ==========================================
echo   Car Stock - Quick Update Script v1.0.13
echo ==========================================
echo.

for /f "delims=" %%i in ('git rev-parse --short HEAD') do set NEW_COMMIT=%%i
echo   Version: %CURRENT_COMMIT% -^> %NEW_COMMIT%
echo.

:: Check if anything changed
if "%CURRENT_COMMIT%"=="%NEW_COMMIT%" (
    echo   Already up to date. No rebuild needed.
    echo.
    pause
    exit /b 0
)

:: Pre-flight: check Docker is running
echo   Checking Docker...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker is not running! Please start Docker Desktop first.
    pause
    exit /b 1
)

:: Pre-flight: check postgres container is up
docker compose ps --status running --format "{{.Name}}" 2>nul | findstr /i "postgres db" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo   Starting containers...
    docker compose up -d postgres
    echo   Waiting for database to be ready...
    timeout /t 10 /nobreak >nul
)

:: Read DB config from running container
set DB_USER=postgres
set DB_NAME=car_stock
for /f "delims=" %%i in ('docker compose exec -T postgres printenv POSTGRES_USER 2^>nul') do set DB_USER=%%i
for /f "delims=" %%i in ('docker compose exec -T postgres printenv POSTGRES_DB 2^>nul') do set DB_NAME=%%i
:: Trim trailing carriage return from docker output
set DB_USER=%DB_USER: =%
set DB_NAME=%DB_NAME: =%
echo   Database: %DB_NAME% (user: %DB_USER%)

:: Step 1: Backup database
echo [1/4] Backing up database...
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATESTAMP=%%c%%a%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIMESTAMP=%%a%%b
set BACKUP_FILE=backups\car-stock_%DATESTAMP%_%TIMESTAMP%_pre-update.dump
if not exist backups mkdir backups
docker compose exec -T postgres pg_dump -U %DB_USER% -Fc %DB_NAME% > "%BACKUP_FILE%"
if %ERRORLEVEL% neq 0 (
    echo ERROR: Database backup failed!
    echo   Check: Is the database running? Try: docker compose ps
    pause
    exit /b 1
)
:: Verify backup file is not empty
for %%F in ("%BACKUP_FILE%") do if %%~zF==0 (
    echo ERROR: Backup file is empty!
    del "%BACKUP_FILE%"
    pause
    exit /b 1
)
echo      Backup saved: %BACKUP_FILE%
echo.

:: Step 2: Database schema sync (using newly pulled prisma schema)
echo [2/4] Updating database schema...
docker compose up -d --build api
timeout /t 5 /nobreak >nul
docker compose exec -T api bunx prisma db push --skip-generate 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Database schema update failed!
    echo Rolling back to %CURRENT_COMMIT%...
    git reset --hard %CURRENT_COMMIT%
    docker compose up -d --build --force-recreate api web updater
    echo Restoring database from backup...
    docker compose exec -T postgres pg_restore -U %DB_USER% -d %DB_NAME% --clean --if-exists < "%BACKUP_FILE%" 2>nul
    pause
    exit /b 1
)
echo      Done.
echo.

:: Step 3: Rebuild and restart all services
echo [3/4] Rebuilding and restarting all services...
docker compose up -d --build --force-recreate api web updater
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to rebuild/start containers!
    pause
    exit /b 1
)
echo      Done.
echo.

:: Step 4: Health check
echo [4/4] Checking services...
timeout /t 10 /nobreak >nul

set ALL_OK=1

curl -sf http://localhost:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   API:      OK
) else (
    echo   API:      Not ready yet
    set ALL_OK=0
)

curl -sf http://localhost/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   Web:      OK
) else (
    echo   Web:      Not ready yet
    set ALL_OK=0
)

docker compose exec -T updater curl -sf http://localhost:9000/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   Updater:  OK
) else (
    echo   Updater:  Not ready yet
    set ALL_OK=0
)

echo.
if "%ALL_OK%"=="1" (
    echo ==========================================
    echo   Update complete!  %CURRENT_COMMIT% -^> %NEW_COMMIT%
    echo ==========================================
) else (
    echo ==========================================
    echo   Update done, some services still starting
    echo   %CURRENT_COMMIT% -^> %NEW_COMMIT%
    echo ==========================================
    echo   Wait a moment and try: docker compose ps
)

echo.
echo   Backup: %BACKUP_FILE%
echo.
pause
