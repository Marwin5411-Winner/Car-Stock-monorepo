#!/bin/bash
set -e

# Manual Rollback Script
# Usage: ./rollback.sh [commit_hash] [backup_file]
# If no args, rolls back to the previous commit and latest backup

PROJECT_DIR="${PROJECT_PATH:-/app/project}"
BRANCH="${UPDATE_BRANCH:-main}"
STATUS_DIR="/app/status"
STATUS_FILE="$STATUS_DIR/update-status.json"
BACKUP_DIR="/app/backups"
LOG_FILE="/app/logs/rollback_$(date +%Y%m%d_%H%M%S).log"

COMPOSE_CMD="docker compose -f $PROJECT_DIR/docker-compose.yml"

DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-car_stock}"

TARGET_COMMIT="${1:-}"
BACKUP_FILE="${2:-}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

write_status() {
  local step_name="$1"
  local status="$2"
  local message="$3"

  cat > "$STATUS_FILE" <<EOF
{
  "step": 0,
  "totalSteps": 0,
  "stepName": "$step_name",
  "status": "$status",
  "message": "$message",
  "startedAt": "$(date -Iseconds)",
  "updatedAt": "$(date -Iseconds)",
  "logs": $(tail -n 50 "$LOG_FILE" 2>/dev/null | jq -R -s 'split("\n") | map(select(. != ""))' 2>/dev/null || echo '[]')
}
EOF
}

main() {
  mkdir -p "$STATUS_DIR" "$(dirname "$LOG_FILE")"
  cd "$PROJECT_DIR"

  log "=========================================="
  log "🔄 Starting manual rollback"
  log "=========================================="

  write_status "Rolling back" "rolling_back" "Manual rollback initiated..."

  # Determine target commit
  if [ -z "$TARGET_COMMIT" ]; then
    # Default: go back one commit
    TARGET_COMMIT=$(git rev-parse HEAD~1 2>/dev/null || "")
    if [ -z "$TARGET_COMMIT" ]; then
      log "ERROR: Cannot determine rollback target. No previous commit found."
      write_status "Rollback failed" "error" "No previous commit found"
      exit 1
    fi
  fi

  log "Rolling back to commit: $TARGET_COMMIT"

  # Determine backup file
  if [ -z "$BACKUP_FILE" ]; then
    # Use the latest backup
    BACKUP_FILE=$(ls -1t "$BACKUP_DIR"/car-stock_*.sql.gz 2>/dev/null | head -1 || echo "")
  fi

  # Step 1: Restore git state
  log "Step 1: Restoring git to $TARGET_COMMIT"
  git fetch origin "$BRANCH" 2>>"$LOG_FILE" || true
  git checkout "$TARGET_COMMIT" 2>>"$LOG_FILE" || {
    log "ERROR: git checkout failed"
    write_status "Rollback failed" "error" "Git checkout failed"
    exit 1
  }

  # Step 2: Restore database (if backup available)
  if [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    log "Step 2: Restoring database from $BACKUP_FILE"
    export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"

    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" 2>>"$LOG_FILE" || true
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>>"$LOG_FILE" || true
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "CREATE DATABASE \"$DB_NAME\";" 2>>"$LOG_FILE" || true
    gunzip -c "$BACKUP_FILE" | pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges 2>>"$LOG_FILE" || true

    log "Database restored"
  else
    log "Step 2: No backup file found, skipping database restore"
  fi

  # Step 3: Rebuild containers
  log "Step 3: Rebuilding containers"
  $COMPOSE_CMD build api web 2>>"$LOG_FILE" || {
    log "ERROR: Docker build failed during rollback"
    write_status "Rollback failed" "error" "Docker build failed"
    exit 1
  }

  # Step 4: Restart services
  log "Step 4: Restarting services"
  $COMPOSE_CMD up -d api web 2>>"$LOG_FILE" || {
    log "ERROR: Failed to restart services"
    write_status "Rollback failed" "error" "Service restart failed"
    exit 1
  }

  # Step 5: Health check
  log "Step 5: Health check"
  HEALTH_OK=false
  for i in $(seq 1 15); do
    sleep 2
    API_HEALTH=$(curl -sf http://api:3001/health 2>/dev/null || echo "fail")
    WEB_HEALTH=$(curl -sf http://web:80/health 2>/dev/null || echo "fail")
    if [ "$API_HEALTH" != "fail" ] && [ "$WEB_HEALTH" != "fail" ]; then
      HEALTH_OK=true
      break
    fi
    log "Health check attempt $i/15..."
  done

  if [ "$HEALTH_OK" = true ]; then
    CURRENT_SHORT=$(git rev-parse --short HEAD)
    write_status "Rollback complete" "success" "Rolled back to $CURRENT_SHORT"
    log "=========================================="
    log "✅ Rollback completed successfully to $CURRENT_SHORT"
    log "=========================================="
  else
    write_status "Rollback complete (unhealthy)" "warning" "Rolled back but health check failed"
    log "⚠️ Rollback completed but health check failed. Manual investigation needed."
  fi
}

main 2>&1 | tee -a "$LOG_FILE"
