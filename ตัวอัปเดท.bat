@echo off
chcp 65001 >nul
title Car Stock - Quick Update
color 0F

echo ==========================================
echo   Car Stock - Quick Update Script v1.0.10
echo ==========================================
echo.

:: Save current commit for rollback
for /f "delims=" %%i in ('git rev-parse --short HEAD') do set CURRENT_COMMIT=%%i
echo   Current version: %CURRENT_COMMIT%
echo.

:: Step 1: Backup database
echo [1/5] Backing up database...
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATESTAMP=%%c%%a%%b
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIMESTAMP=%%a%%b
set BACKUP_FILE=backups\car-stock_%DATESTAMP%_%TIMESTAMP%_pre-update.dump
if not exist backups mkdir backups
docker compose exec -T postgres pg_dump -U postgres -Fc car_stock > "%BACKUP_FILE%" 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Database backup failed!
    pause
    exit /b 1
)
echo      Backup saved: %BACKUP_FILE%
echo.

:: Step 2: Git pull
echo [2/5] Pulling latest code...
git pull origin main
if %ERRORLEVEL% neq 0 (
    echo ERROR: git pull failed!
    pause
    exit /b 1
)
for /f "delims=" %%i in ('git rev-parse --short HEAD') do set NEW_COMMIT=%%i
echo      Updated to: %NEW_COMMIT%
echo.

:: Check if anything changed
if "%CURRENT_COMMIT%"=="%NEW_COMMIT%" (
    echo   Already up to date. No rebuild needed.
    echo.
    pause
    exit /b 0
)

:: Step 3: Rebuild containers
echo [3/5] Rebuilding Docker containers...
docker compose build api web
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker build failed!
    echo Rolling back to %CURRENT_COMMIT%...
    git reset --hard %CURRENT_COMMIT%
    pause
    exit /b 1
)
echo      Done.
echo.

:: Step 4: Database schema sync
echo [4/5] Updating database schema...
docker compose run --rm --no-deps -e DATABASE_URL=postgresql://postgres:postgres@postgres:5432/car_stock?schema=public api bunx prisma db push --skip-generate 2>&1
if %ERRORLEVEL% neq 0 (
    echo ERROR: Database schema update failed!
    echo Rolling back to %CURRENT_COMMIT%...
    git reset --hard %CURRENT_COMMIT%
    docker compose build api web
    docker compose up -d api web
    echo Restoring database from backup...
    docker compose exec -T postgres pg_restore -U postgres -d car_stock --clean --if-exists < "%BACKUP_FILE%" 2>nul
    pause
    exit /b 1
)
echo      Done.
echo.

:: Step 5: Restart services
echo [5/5] Restarting services...
docker compose up -d api web
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to start containers!
    pause
    exit /b 1
)
echo      Done.
echo.

echo ==========================================
echo   Update complete!  %CURRENT_COMMIT% -^> %NEW_COMMIT%
echo ==========================================
echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

:: Health check
curl -sf http://localhost:3001/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   API:  OK
) else (
    echo   API:  Not ready yet ^(may need a few more seconds^)
)

curl -sf http://localhost/health >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo   Web:  OK
) else (
    echo   Web:  Not ready yet ^(may need a few more seconds^)
)

echo.
echo   Backup: %BACKUP_FILE%
echo   Rollback: git reset --hard %CURRENT_COMMIT%
echo.
pause
