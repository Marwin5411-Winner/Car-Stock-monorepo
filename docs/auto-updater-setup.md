# Auto-Updater Setup Guide

## Overview

The auto-updater is a Docker sidecar service (`apps/updater/`) that manages automated deployment of the Car-Stock monorepo. It provides a 9-step update pipeline with automatic rollback on failure, exposed via an HTTP API.

### Architecture

```
                    ┌─────────────────────────────────────────┐
                    │           Docker Compose Network         │
                    │                                         │
  Admin UI ────►    │  ┌─────┐      ┌─────────┐              │
  (Settings page)   │  │ API │─────►│ Updater │              │
                    │  │:3001│      │  :9000  │              │
                    │  └─────┘      └────┬────┘              │
                    │                    │                    │
                    │          ┌─────────┼─────────┐         │
                    │          │         │         │         │
                    │    ┌─────▼──┐ ┌────▼───┐ ┌──▼───┐     │
                    │    │ Docker │ │  Git   │ │ PG   │     │
                    │    │ Socket │ │ Repo   │ │ DB   │     │
                    │    └────────┘ └────────┘ └──────┘     │
                    └─────────────────────────────────────────┘
```

The updater container has access to:
- **Docker socket** — to rebuild and restart api/web containers
- **Project directory** — bind-mounted from host for git operations
- **PostgreSQL** — for database backup/restore via network

## Prerequisites

- Docker and Docker Compose v2
- Git remote access (SSH key or HTTPS credentials configured in the project)
- PostgreSQL (provided by docker-compose)
- `socat`, `curl`, `jq`, `cron` (included in the updater Dockerfile)

## Configuration

All configuration is via environment variables in `.env.docker`:

| Variable | Default | Description |
|----------|---------|-------------|
| `UPDATE_BRANCH` | `main` | Git branch to pull updates from |
| `UPDATE_SECRET` | *(empty)* | Bearer token for API authentication. **Set this in production.** |
| `UPDATER_PORT` | `9000` | HTTP server port inside the container |
| `PROJECT_PATH` | `.` | Host path to the project (bind-mounted into container) |
| `POSTGRES_HOST` | `postgres` | Database hostname |
| `POSTGRES_PORT` | `5432` | Database port |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `POSTGRES_DB` | `car_stock` | Database name |

## Installation

### First-time setup

1. **Clone the repository:**
   ```bash
   git clone <repo-url> car-stock
   cd car-stock
   ```

2. **Configure environment:**
   ```bash
   cp .env.docker.example .env.docker
   # Edit .env.docker — set UPDATE_SECRET, POSTGRES_PASSWORD, JWT_SECRET
   ```

3. **Build and start all services:**
   ```bash
   make up-build
   ```

4. **Verify all services are healthy:**
   ```bash
   docker compose ps
   # All services should show "healthy" status
   ```

5. **Test update check:**
   ```bash
   make check-update
   ```

## Usage

### Admin UI

Navigate to **Settings** page in the web app. The **System Update** section provides:
- Current version display
- Check for updates button
- One-click update with confirmation dialog
- Real-time progress tracking with step indicators
- Rollback button
- Backup list viewer

### CLI Commands (via Makefile)

```bash
make check-update    # Check if updates are available
make update          # Trigger the full update pipeline
make rollback        # Rollback to previous version
make backup          # Create a manual database backup
make backups         # List available backups
make logs-updater    # View updater logs
make shell-updater   # Shell into updater container
```

### HTTP API

The updater exposes these endpoints on port 9000 (internal network only):

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | Health check (used by Docker) |
| `GET` | `/check` | Yes | Check for available updates |
| `POST` | `/update` | Yes | Trigger update pipeline |
| `GET` | `/status` | Yes | Get current update/rollback status |
| `POST` | `/rollback` | Yes | Trigger manual rollback |
| `GET` | `/backups` | Yes | List available database backups |
| `GET` | `/version` | Yes | Get current version info |

**curl examples** (from inside the Docker network or another container):

```bash
# Health check (no auth needed)
curl -sf http://updater:9000/health

# Check for updates
curl -sf -H "Authorization: Bearer $UPDATE_SECRET" http://updater:9000/check

# Trigger update
curl -sf -X POST -H "Authorization: Bearer $UPDATE_SECRET" http://updater:9000/update

# Get status
curl -sf -H "Authorization: Bearer $UPDATE_SECRET" http://updater:9000/status

# Rollback to specific commit with specific backup
curl -sf -X POST -H "Authorization: Bearer $UPDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"commit": "abc1234", "backupFile": "/app/backups/car-stock_2026-01-01_12-00-00_pre-update.dump"}' \
  http://updater:9000/rollback
```

The API is accessed by the frontend through the API backend (`UPDATER_URL=http://updater:9000`), not directly from the browser.

## How Updates Work

The update pipeline runs 9 steps sequentially. If any step fails, automatic rollback is triggered.

| Step | Name | Description |
|------|------|-------------|
| 1 | **Pre-flight checks** | Verify disk space (>1GB), stash uncommitted changes |
| 2 | **Backup database** | Create `pg_dump` backup in custom format (`.dump`) |
| 3 | **Save rollback point** | Record current git commit hash |
| 4 | **Pull latest code** | `git pull origin <branch>` |
| 5 | **Build containers** | `docker compose build api web` |
| 6 | **Update database schema** | `prisma db push --skip-generate` via temp container |
| 7 | **Restart services** | `docker compose up -d api web` |
| 8 | **Health check** | Poll `/health` on api and web (30s timeout, 15 attempts) |
| 9 | **Complete** | Write success status, clean up old Docker images |

## Rollback

### Automatic Rollback

Triggered automatically when any update step fails. The rollback:
1. Resets git to the saved rollback commit (stays on branch)
2. Restores database from the pre-update backup (if DB was modified)
3. Rebuilds containers from the rolled-back source (if images were built)

### Manual Rollback

**Via UI:** Click the "Rollback" button in Settings > System Update.

**Via CLI:**
```bash
# Rollback to previous commit with latest backup
make rollback

# Or with specific target (inside container)
docker compose exec updater /app/rollback.sh <commit_hash> <backup_file>
```

**Via API:**
```bash
# Rollback to previous commit
curl -X POST -H "Authorization: Bearer $UPDATE_SECRET" http://updater:9000/rollback

# Rollback to specific commit
curl -X POST -H "Authorization: Bearer $UPDATE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"commit": "abc1234"}' http://updater:9000/rollback
```

Manual rollback steps:
1. Checkout target branch and reset to target commit
2. Restore database from backup (latest or specified)
3. Rebuild Docker images
4. Restart services
5. Health check

## Backups

### Automatic Schedule

A cron job runs daily at **17:00 Bangkok time**, creating a database backup.

### Manual Backup

```bash
make backup
```

### Retention Policy

Only the **5 most recent** backups are kept. Older backups are automatically rotated.

### Backup Format

Backups use PostgreSQL custom format (`pg_dump -Fc`), which includes built-in compression. Files are stored at `/app/backups/` (a Docker volume) with naming pattern:

```
car-stock_YYYY-MM-DD_HH-MM-SS_<type>.dump
```

Where `<type>` is `scheduled`, `pre-update`, or `manual`.

### Restore Procedure

To manually restore a backup:

```bash
# Shell into updater
make shell-updater

# List backups
ls -lh /app/backups/

# Restore (this will drop and recreate the database)
export PGPASSWORD=postgres
psql -h postgres -U postgres -d postgres -c "DROP DATABASE IF EXISTS car_stock;"
psql -h postgres -U postgres -d postgres -c "CREATE DATABASE car_stock;"
pg_restore -h postgres -U postgres -d car_stock --no-owner --no-privileges /app/backups/<backup-file>.dump
```

## Monitoring

### Status Endpoint

```bash
# From inside the network
curl -H "Authorization: Bearer $UPDATE_SECRET" http://updater:9000/status
```

Returns JSON with:
- `step` / `totalSteps` — progress indicator
- `stepName` — current step name
- `status` — `idle`, `running`, `rolling_back`, `success`, `error`, `rollback_complete`, `warning`
- `message` — human-readable description
- `logs` — last 50 lines of the log file

### Log Files

Logs are stored in the `updater_logs` Docker volume at `/app/logs/`:
- `update_YYYYMMDD_HHMMSS.log` — update pipeline logs
- `rollback_YYYYMMDD_HHMMSS.log` — rollback logs
- `backup.log` — scheduled backup cron logs

View from host:
```bash
make logs-updater         # Docker container logs
docker compose exec updater cat /app/logs/<logfile>
```

### Docker Health Checks

The updater has a Docker healthcheck configured (`GET /health` every 30s). Check health status:

```bash
docker compose ps updater
```

## Troubleshooting

### Update stuck / lock file stale

If an update appears stuck or a previous crash left a stale lock:

```bash
# Check if update process is actually running
docker compose exec updater cat /tmp/update.lock
docker compose exec updater ps aux

# If the PID in the lock file is dead, remove the lock
docker compose exec updater rm -f /tmp/update.lock
```

### Docker healthcheck fails for updater

The `/health` endpoint does not require authentication. If Docker marks the updater as unhealthy, check:
1. Is socat running? `docker compose exec updater ps aux | grep socat`
2. Is port 9000 listening? `docker compose exec updater curl -sf http://localhost:9000/health`

### Git pull fails

Common causes:
- Network connectivity to git remote
- SSH key not available in the container
- Merge conflicts (the updater stashes local changes before pulling)

Check:
```bash
docker compose exec updater git -C /app/project remote -v
docker compose exec updater git -C /app/project fetch origin main
```

### Database backup/restore fails

- Verify PostgreSQL connectivity: `docker compose exec updater pg_isready -h postgres`
- Check credentials match `.env.docker` settings
- Ensure sufficient disk space for backups

### Prisma db push fails with "data loss" error

This means the schema change would drop columns/tables with existing data. The updater intentionally aborts in this case. Manual intervention required:
1. Review the schema changes
2. If data loss is acceptable: run manually with `--accept-data-loss`
3. If not: write a migration script first

## Security

### UPDATE_SECRET

- **Always set `UPDATE_SECRET`** in production. Without it, any service on the Docker network can trigger updates.
- The secret is passed as a `Bearer` token in the `Authorization` header.
- The `/health` endpoint is exempt from auth (required for Docker healthcheck).

### Docker Socket Access

The updater has access to the Docker socket (`/var/run/docker.sock`), which grants it the ability to manage all containers. This is necessary for rebuilding and restarting services.

**Mitigation:** The updater is not exposed to external networks. Only the API backend can reach it via `http://updater:9000`, and the API requires ADMIN role authentication.

### Network Isolation

The updater port (9000) is **not exposed** to the host. It's only accessible within the `car-stock-network` Docker bridge network. External access goes through: Browser → Web → API (with ADMIN auth) → Updater.

### Backup File Path Validation

The rollback API validates that any specified backup file path starts with `/app/backups/` to prevent path traversal.

## Known Limitations

1. **Updater cannot update itself.** If scripts in `apps/updater/` change, you must manually rebuild the updater container:
   ```bash
   docker compose up -d --build updater
   ```

2. **Downtime during rebuild.** Steps 5-7 (build, schema push, restart) cause brief downtime (~30s-2min depending on build time). There is no zero-downtime deployment.

3. **Single-branch updates only.** The updater pulls from one configured branch (`UPDATE_BRANCH`). It cannot switch branches.

4. **Backup retention is count-based.** Only 5 backups are kept regardless of age. High-frequency manual backups will push out older scheduled backups.

5. **No notification system.** Update success/failure is only visible in the admin UI or logs. Consider adding webhook notifications for production use.
