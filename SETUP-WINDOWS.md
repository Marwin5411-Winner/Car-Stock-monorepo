# VBeyond Car Stock — Windows Setup Guide (Docker + Auto-Update)

## Prerequisites

Before starting, install the following on your Windows machine:

### 1. Docker Desktop for Windows

Download from: https://www.docker.com/products/docker-desktop/

After installing:
- Open Docker Desktop
- Go to **Settings → General** → ensure **"Use the WSL 2 based engine"** is checked
- Go to **Settings → Resources → WSL Integration** → enable your WSL distro (if using WSL)
- Make sure Docker is **running** (whale icon in system tray should be stable)

### 2. Git for Windows

Download from: https://git-scm.com/download/win

During installation, select:
- **"Git from the command line and also from 3rd-party software"**
- **"Checkout as-is, commit Unix-style line endings"** (important for shell scripts)

### 3. Make for Windows (optional but recommended)

The project includes a Makefile with convenient shortcuts. Install via:

```powershell
# Option A: Using Chocolatey
choco install make

# Option B: Using winget
winget install GnuWin32.Make
```

If you don't want to install Make, you can run the `docker compose` commands directly (shown below as alternatives).

---

## Step-by-Step Setup

### Step 1: Clone the Repository

Open **PowerShell** or **Git Bash** and run:

```powershell
cd C:\Projects   # or wherever you want to keep it
git clone https://github.com/YOUR_ORG/Car-Stock-monorepo.git
cd Car-Stock-monorepo
```

### Step 2: Configure Environment

Copy and edit the environment file:

```powershell
# The .env.docker file already exists, but you MUST change these values for production:
notepad .env.docker
```

Edit these values in `.env.docker`:

```env
# ---- CHANGE THESE FOR PRODUCTION ----
POSTGRES_PASSWORD=your-strong-database-password-here
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars
UPDATE_SECRET=your-updater-api-secret-key

# ---- Adjust ports if needed ----
API_PORT=3040
WEB_PORT=5050

# ---- Git branch for auto-updates ----
UPDATE_BRANCH=main

# ---- Usually keep as-is ----
POSTGRES_USER=postgres
POSTGRES_DB=car_stock
NODE_ENV=production
CORS_ORIGIN=http://localhost
PROJECT_PATH=.
```

**Important port note:** The web UI defaults to port `5050`. If port 5050 is taken, change `WEB_PORT` to another value (e.g., `8080`).

### Step 3: Fix Line Endings (Critical on Windows)

The updater container runs shell scripts that **must** have Unix line endings (LF). Windows Git may convert them to CRLF, which will break the containers.

```powershell
# Ensure shell scripts use Unix line endings
git config core.autocrlf input

# Force re-checkout of shell scripts with correct line endings
git rm --cached -r apps/updater/
git rm --cached apps/api/docker-entrypoint.sh
git checkout -- apps/updater/
git checkout -- apps/api/docker-entrypoint.sh
```

Alternatively, create a `.gitattributes` file in the repo root if one doesn't exist:

```
*.sh text eol=lf
crontab text eol=lf
```

### Step 4: Build and Start Everything

```powershell
# Using Make:
make up-build

# Without Make (equivalent command):
docker compose --env-file .env.docker up -d --build
```

This will:
1. Build the API image (ElysiaJS + Prisma)
2. Build the Web image (React + Nginx)
3. Build the Updater image (shell-based sidecar)
4. Pull PostgreSQL 16 and Gotenberg images
5. Start all 5 services

**First build takes 3–5 minutes** depending on your internet speed.

### Step 5: Verify All Services Are Running

```powershell
docker compose ps
```

You should see all 5 containers with status `Up (healthy)`:

```
NAME                STATUS
car-stock-db        Up (healthy)
car-stock-api       Up (healthy)
car-stock-web       Up (healthy)
car-stock-updater   Up (healthy)
car-stock-gotenberg Up
```

If a container shows `starting` or `unhealthy`, wait 30–60 seconds and check again. The API waits for PostgreSQL to be ready before starting.

### Step 6: Seed the Database (First Time Only)

```powershell
# Using Make:
make db-seed

# Without Make:
docker compose exec api bunx prisma db seed
```

This creates test users and sample data.

### Step 7: Access the Application

Open your browser:

- **Web UI:** http://localhost:5050 (or whatever `WEB_PORT` you set)
- **API:** http://localhost:3040/health (should return a health check response)

**Default login credentials (dev/test only):**

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| manager1 | password123 | Sales Manager |
| sales1 | password123 | Sales Staff |
| stock1 | password123 | Stock Staff |
| account1 | password123 | Accountant |

---

## Auto-Update System

The updater sidecar handles automatic updates from your Git repository. It runs inside its own container and manages the full update lifecycle.

### How It Works

1. **You push code** to the `main` branch (or whatever `UPDATE_BRANCH` is set to)
2. **Trigger an update** via the API or command line
3. The updater automatically:
   - Backs up the database
   - Pulls the latest code from Git
   - Rebuilds the API and Web containers
   - Syncs the database schema (Prisma)
   - Restarts the services
   - Runs health checks
   - **Auto-rolls back** if anything fails

### Trigger an Update

```powershell
# Using Make:
make check-update    # Check if updates are available
make update          # Trigger the update

# Without Make:
docker compose --env-file .env.docker exec updater /app/check.sh
docker compose --env-file .env.docker exec updater /app/update.sh
```

Or via the HTTP API (from any machine on the network):

```powershell
# Check for updates
curl http://localhost:9000/check -H "Authorization: Bearer YOUR_UPDATE_SECRET"

# Trigger update
curl -X POST http://localhost:9000/update -H "Authorization: Bearer YOUR_UPDATE_SECRET"

# Monitor progress
curl http://localhost:9000/status -H "Authorization: Bearer YOUR_UPDATE_SECRET"
```

### Automatic Scheduled Updates (Optional)

The updater doesn't auto-pull by default — you trigger updates manually or via API. To add a scheduled auto-update, shell into the updater and edit the crontab:

```powershell
# Shell into updater
make shell-updater
# (or: docker compose --env-file .env.docker exec updater bash)

# Edit crontab to add auto-update (example: every day at 2 AM Bangkok time)
echo "0 2 * * * /app/update.sh >> /app/logs/update.log 2>&1" >> /etc/crontabs/root
```

Note: The existing crontab already runs a **daily database backup at 5 PM Bangkok time** automatically.

### Manual Backup and Rollback

```powershell
# Create a backup now
make backup

# List all backups
make backups

# Rollback to previous version (restores code + database)
make rollback

# View updater logs
make logs-updater
```

---

## Common Windows Issues and Fixes

### Issue: "no matching manifest for windows/amd64"
**Fix:** In Docker Desktop → Settings → General, ensure "Use the WSL 2 based engine" is enabled. All images in this project are Linux-based.

### Issue: Shell scripts fail with "bad interpreter" or "\r" errors
**Cause:** Windows CRLF line endings in shell scripts.
**Fix:** Run the line-ending fix from Step 3 above, then rebuild:
```powershell
docker compose --env-file .env.docker up -d --build
```

### Issue: Port already in use
**Fix:** Change the port in `.env.docker`:
```env
WEB_PORT=8080    # Change from 5050
API_PORT=3041    # Change from 3040
```
Then restart: `docker compose --env-file .env.docker up -d`

### Issue: Docker volumes permission errors
**Fix:** Run PowerShell as Administrator, or ensure your user is in the `docker-users` group:
```powershell
net localgroup docker-users YOUR_USERNAME /add
```

### Issue: Updater can't access Docker socket
**Cause:** The updater needs access to `/var/run/docker.sock` to rebuild containers.
**Fix:** In Docker Desktop → Settings → General, ensure "Expose daemon on tcp://localhost:2375 without TLS" is **unchecked** (the socket mount works via WSL2). If issues persist, try Docker Desktop → Settings → Resources → WSL Integration and toggle your distro.

### Issue: Database connection timeout on first start
**Cause:** PostgreSQL hasn't finished initializing yet.
**Fix:** Wait 30 seconds and try again. The API has a `depends_on` health check, but the first startup can be slow.

---

## Useful Commands Reference

| Task | Make Command | Docker Command |
|------|-------------|----------------|
| Start all | `make up` | `docker compose --env-file .env.docker up -d` |
| Start + rebuild | `make up-build` | `docker compose --env-file .env.docker up -d --build` |
| Stop all | `make down` | `docker compose down` |
| View all logs | `make logs` | `docker compose logs -f` |
| View API logs | `make logs-api` | `docker compose logs -f api` |
| Seed database | `make db-seed` | `docker compose exec api bunx prisma db seed` |
| Check for updates | `make check-update` | `docker compose --env-file .env.docker exec updater /app/check.sh` |
| Run update | `make update` | `docker compose --env-file .env.docker exec updater /app/update.sh` |
| Rollback | `make rollback` | `docker compose --env-file .env.docker exec updater /app/rollback.sh` |
| Manual backup | `make backup` | `docker compose --env-file .env.docker exec updater /app/backup.sh manual` |
| List backups | `make backups` | `docker compose --env-file .env.docker exec updater ls -lh /app/backups/` |
| Full cleanup | `make clean` | `docker compose down -v --rmi all --remove-orphans` |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    Windows Host                       │
│                                                       │
│   Browser → http://localhost:5050                     │
│                    │                                  │
│   ┌────────────────┼──── Docker Desktop ─────────────┐│
│   │                ▼                                 ││
│   │   ┌──────────────────┐    ┌─────────────────┐   ││
│   │   │   Web (Nginx)    │───▶│  API (Elysia)   │   ││
│   │   │   Port: 5050     │    │  Port: 3040     │   ││
│   │   └──────────────────┘    └────────┬────────┘   ││
│   │                                     │            ││
│   │                              ┌──────▼───────┐   ││
│   │                              │  PostgreSQL   │   ││
│   │                              │  (internal)   │   ││
│   │                              └──────▲───────┘   ││
│   │                                     │            ││
│   │   ┌──────────────────┐    ┌─────────┴───────┐   ││
│   │   │  Gotenberg (PDF) │    │    Updater      │   ││
│   │   │  Port: 3000      │    │  Port: 9000     │   ││
│   │   └──────────────────┘    └─────────────────┘   ││
│   │                                                  ││
│   └──────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────┘
```

**Update flow:** Push to Git → Trigger update (API/CLI) → Updater pulls code → Backs up DB → Rebuilds containers → Health check → Done (or auto-rollback on failure)
