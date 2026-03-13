#!/bin/bash
set -eo pipefail

# Update Pipeline Script
# Performs: backup → git pull → build → db push → restart → health check
# With full rollback on failure

PROJECT_DIR="${PROJECT_PATH:-/app/project}"
BRANCH="${UPDATE_BRANCH:-main}"
STATUS_DIR="/app/status"
STATUS_FILE="$STATUS_DIR/update-status.json"
BACKUP_DIR="/app/backups"
LOG_FILE="/app/logs/update_$(date +%Y%m%d_%H%M%S).log"

# Compose command (use the project directory as context)
COMPOSE_CMD="docker compose -f $PROJECT_DIR/docker-compose.yml"

# Database connection
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-car_stock}"

# Lock file for concurrent update protection
UPDATE_LOCK="/tmp/update.lock"

# Track state for rollback
ROLLBACK_COMMIT=""
BACKUP_FILE=""
DB_CHANGED=false
IMAGES_BUILT=false

# --- Status Helpers ---

write_status() {
  local step="$1"
  local total_steps="$2"
  local step_name="$3"
  local status="$4"
  local message="$5"

  cat > "$STATUS_FILE" <<EOF
{
  "step": $step,
  "totalSteps": $total_steps,
  "stepName": "$step_name",
  "status": "$status",
  "message": "$message",
  "startedAt": "$UPDATE_STARTED_AT",
  "updatedAt": "$(date -Iseconds)",
  "logs": $(tail -n 50 "$LOG_FILE" 2>/dev/null | jq -R -s 'split("\n") | map(select(. != ""))' 2>/dev/null || echo '[]')
}
EOF
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# --- Rollback Function ---

rollback() {
  trap - ERR  # Prevent recursive rollback on errors during rollback
  local reason="$1"
  log "🔄 ROLLBACK triggered: $reason"
  write_status 0 9 "Rolling back" "rolling_back" "$reason"

  cd "$PROJECT_DIR"

  # Restore git state (stay on branch to avoid detached HEAD)
  if [ -n "$ROLLBACK_COMMIT" ]; then
    log "Restoring git to commit: $ROLLBACK_COMMIT"
    git reset --hard "$ROLLBACK_COMMIT" 2>>"$LOG_FILE" || true
    git checkout "$BRANCH" 2>>"$LOG_FILE" || true
  fi

  # Restore database if it was modified
  if [ "$DB_CHANGED" = true ] && [ -n "$BACKUP_FILE" ] && [ -f "$BACKUP_FILE" ]; then
    log "Restoring database from backup: $BACKUP_FILE"
    export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
    # Drop and recreate DB, then restore
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_NAME' AND pid <> pg_backend_pid();" 2>>"$LOG_FILE" || true
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>>"$LOG_FILE" || true
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
      -c "CREATE DATABASE \"$DB_NAME\";" 2>>"$LOG_FILE" || true
    pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges "$BACKUP_FILE" 2>>"$LOG_FILE" || true
    log "Database restored successfully"
  fi

  # Rebuild from rolled-back source
  if [ "$IMAGES_BUILT" = true ]; then
    log "Rebuilding containers from rolled-back source..."
    cd "$PROJECT_DIR"
    $COMPOSE_CMD build api web 2>>"$LOG_FILE" || true
    $COMPOSE_CMD up -d api web gotenberg 2>>"$LOG_FILE" || true
  fi

  write_status 0 9 "Rollback complete" "rollback_complete" "Rolled back due to: $reason"
  log "🔄 Rollback complete."
  exit 1
}

# --- Main Update Pipeline ---

main() {
  UPDATE_STARTED_AT="$(date -Iseconds)"
  mkdir -p "$STATUS_DIR" "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

  # Concurrent update protection (guards against direct invocation via Makefile)
  if [ -f "$UPDATE_LOCK" ]; then
    local lock_pid
    lock_pid=$(cat "$UPDATE_LOCK" 2>/dev/null)
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
      # Allow if lock holder is our parent (called via server.sh subshell)
      if [ "$lock_pid" != "$PPID" ]; then
        echo "ERROR: Another update is already running (PID: $lock_pid)" >&2
        exit 1
      fi
    else
      rm -f "$UPDATE_LOCK"
    fi
  fi
  # Create lock if not already held (direct invocation)
  if [ ! -f "$UPDATE_LOCK" ]; then
    echo $$ > "$UPDATE_LOCK"
    trap 'rm -f "$UPDATE_LOCK"' EXIT
  fi

  # Trap unexpected errors to trigger rollback
  trap 'rollback "Unexpected error at line $LINENO"' ERR

  log "=========================================="
  log "🚀 Starting update pipeline"
  log "=========================================="

  cd "$PROJECT_DIR"

  # Step 1: Pre-flight checks
  write_status 1 9 "Pre-flight checks" "running" "Checking system status..."
  log "Step 1/9: Pre-flight checks"

  # Check git status
  if ! git diff --quiet 2>/dev/null; then
    log "WARNING: Working directory has uncommitted changes. Stashing..."
    git stash 2>>"$LOG_FILE" || true
  fi

  # Check disk space (need at least 1GB free)
  AVAILABLE_KB=$(df -k /app/project | tail -1 | awk '{print $4}')
  if [ "$AVAILABLE_KB" -lt 1048576 ]; then
    rollback "Insufficient disk space (need at least 1GB free)"
  fi

  log "Pre-flight checks passed"

  # Step 2: Backup database
  write_status 2 9 "Backing up database" "running" "Creating database backup..."
  log "Step 2/9: Backing up database"

  BACKUP_FILE=$(/app/backup.sh pre-update 2>>"$LOG_FILE" | tail -1)
  if [ ! -f "$BACKUP_FILE" ]; then
    rollback "Database backup failed"
  fi
  log "Backup created: $BACKUP_FILE"

  # Step 3: Save rollback point
  write_status 3 9 "Saving rollback point" "running" "Recording current version..."
  log "Step 3/9: Saving rollback point"

  ROLLBACK_COMMIT=$(git rev-parse HEAD)
  ROLLBACK_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "none")
  log "Rollback point: $ROLLBACK_COMMIT (tag: $ROLLBACK_TAG)"

  # Step 4: Git pull
  write_status 4 9 "Pulling latest code" "running" "Downloading updates from Git..."
  log "Step 4/9: Git pull origin $BRANCH"

  if ! git pull origin "$BRANCH" 2>>"$LOG_FILE"; then
    rollback "Git pull failed"
  fi

  NEW_COMMIT=$(git rev-parse --short HEAD)
  NEW_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "none")
  log "Updated to: $NEW_COMMIT (tag: $NEW_TAG)"

  # Step 5: Build Docker images
  write_status 5 9 "Building containers" "running" "Rebuilding API and Web containers..."
  log "Step 5/9: Building Docker images (api, web)"

  if ! $COMPOSE_CMD build api web 2>>"$LOG_FILE"; then
    rollback "Docker build failed"
  fi
  IMAGES_BUILT=true
  log "Docker images built successfully"

  # Step 6: Database schema sync (prisma db push)
  write_status 6 9 "Updating database schema" "running" "Running prisma db push..."
  log "Step 6/9: Running prisma db push"

  # Run prisma db push inside a temporary API container
  # This uses the newly built API image which has the updated schema
  DB_PUSH_OUTPUT=$($COMPOSE_CMD run --rm --no-deps \
    -e DATABASE_URL="postgresql://${DB_USER}:${POSTGRES_PASSWORD:-postgres}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public" \
    api bunx prisma db push --skip-generate 2>&1) || {
    log "prisma db push output: $DB_PUSH_OUTPUT"
    # Check if it needs --accept-data-loss
    if echo "$DB_PUSH_OUTPUT" | grep -q "accept-data-loss"; then
      log "ERROR: Schema change would cause data loss. Aborting."
      rollback "Database schema update would cause data loss. Manual intervention required."
    else
      rollback "prisma db push failed: $DB_PUSH_OUTPUT"
    fi
  }
  DB_CHANGED=true
  log "Database schema updated successfully"

  # Step 7: Restart services
  write_status 7 9 "Restarting services" "running" "Starting updated containers..."
  log "Step 7/9: Restarting services (api, web, gotenberg)"

  if ! $COMPOSE_CMD up -d api web gotenberg 2>>"$LOG_FILE"; then
    rollback "Failed to restart services"
  fi
  log "Services restarted"

  # Step 8: Health check
  write_status 8 9 "Health check" "running" "Verifying services are healthy..."
  log "Step 8/9: Health check (30s timeout)"

  HEALTH_OK=false
  for i in $(seq 1 15); do
    sleep 2
    API_HEALTH=$(curl -sf http://api:3001/health 2>/dev/null || echo "fail")
    WEB_HEALTH=$(curl -sf http://web:80/health 2>/dev/null || echo "fail")

    if [ "$API_HEALTH" != "fail" ] && [ "$WEB_HEALTH" != "fail" ]; then
      HEALTH_OK=true
      log "Health check passed (attempt $i)"
      break
    fi
    log "Health check attempt $i/15: API=$API_HEALTH, Web=$WEB_HEALTH"
  done

  if [ "$HEALTH_OK" != true ]; then
    rollback "Health check failed after 30 seconds"
  fi

  # Step 9: Done — clear ERR trap since update succeeded
  trap - ERR
  write_status 9 9 "Update complete" "success" "Successfully updated to $NEW_COMMIT"
  log "=========================================="
  log "✅ Update completed successfully!"
  log "   From: $ROLLBACK_COMMIT ($ROLLBACK_TAG)"
  log "   To:   $NEW_COMMIT ($NEW_TAG)"
  log "=========================================="

  # Clean up old Docker images (non-fatal)
  docker image prune -f 2>/dev/null || true
}

# Run main with output logging
main 2>&1 | tee -a "$LOG_FILE"
