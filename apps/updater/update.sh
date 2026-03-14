#!/bin/bash
set -eo pipefail

# Update Pipeline Script
# Performs: backup → git pull → self-update → build → db push → restart → health check
# With full rollback on failure
#
# Self-update: If updater scripts changed in the new commits, the scripts are
# hot-swapped and this script re-executes itself with --self-updated to prevent
# infinite loops.

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

# Self-update flag (prevents infinite re-exec loop)
SELF_UPDATED=false
if [ "${1:-}" = "--self-updated" ]; then
  SELF_UPDATED=true
fi

# Total pipeline steps
TOTAL_STEPS=10

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
  write_status 0 $TOTAL_STEPS "Rolling back" "rolling_back" "$reason"

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

  write_status 0 $TOTAL_STEPS "Rollback complete" "rollback_complete" "Rolled back due to: $reason"
  log "🔄 Rollback complete."
  exit 1
}

# --- Main Update Pipeline ---

main() {
  UPDATE_STARTED_AT="$(date -Iseconds)"
  mkdir -p "$STATUS_DIR" "$BACKUP_DIR" "$(dirname "$LOG_FILE")"

  # Rotate old log files (keep last 10)
  ls -1t /app/logs/update_*.log 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

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

  cd "$PROJECT_DIR"

  # If re-exec'd after self-update, skip steps 1-4 (already completed)
  if [ "$SELF_UPDATED" = true ]; then
    log "=========================================="
    log "🔄 Resuming update pipeline after self-update"
    log "=========================================="
  else
    log "=========================================="
    log "🚀 Starting update pipeline"
    log "=========================================="
  fi

  # --- Steps 1-4 are skipped when SELF_UPDATED=true (already done before re-exec) ---
  if [ "$SELF_UPDATED" = false ]; then

  # Step 1: Pre-flight checks
  write_status 1 $TOTAL_STEPS "Pre-flight checks" "running" "Checking system status..."
  log "Step 1/$TOTAL_STEPS: Pre-flight checks"

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
  write_status 2 $TOTAL_STEPS "Backing up database" "running" "Creating database backup..."
  log "Step 2/$TOTAL_STEPS: Backing up database"

  BACKUP_FILE=$(/app/backup.sh pre-update 2>>"$LOG_FILE" | tail -1)
  if [ ! -f "$BACKUP_FILE" ]; then
    rollback "Database backup failed"
  fi
  log "Backup created: $BACKUP_FILE"

  # Step 3: Save rollback point
  write_status 3 $TOTAL_STEPS "Saving rollback point" "running" "Recording current version..."
  log "Step 3/$TOTAL_STEPS: Saving rollback point"

  ROLLBACK_COMMIT=$(git rev-parse HEAD)
  ROLLBACK_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "none")
  log "Rollback point: $ROLLBACK_COMMIT (tag: $ROLLBACK_TAG)"

  # Step 4: Git pull
  write_status 4 $TOTAL_STEPS "Pulling latest code" "running" "Downloading updates from Git..."
  log "Step 4/$TOTAL_STEPS: Git pull origin $BRANCH"

  if ! git pull origin "$BRANCH" 2>>"$LOG_FILE"; then
    rollback "Git pull failed"
  fi

  NEW_COMMIT=$(git rev-parse --short HEAD)
  NEW_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "none")
  log "Updated to: $NEW_COMMIT (tag: $NEW_TAG)"

  fi  # end of SELF_UPDATED=false block (steps 1-4)

  # Step 5: Self-update check — if updater scripts changed, hot-swap and re-exec
  write_status 5 $TOTAL_STEPS "Checking updater scripts" "running" "Checking if deploy scripts need updating..."
  log "Step 5/$TOTAL_STEPS: Checking for updater script changes"

  if [ "$SELF_UPDATED" = false ]; then
    UPDATER_CHANGED=$(git diff --name-only "$ROLLBACK_COMMIT" HEAD -- apps/updater/ 2>/dev/null || echo "")
    if [ -n "$UPDATER_CHANGED" ]; then
      log "Updater scripts changed in new commits:"
      log "$UPDATER_CHANGED"
      log "Hot-swapping updater scripts before continuing..."

      # Copy new scripts to /app/ (where they actually run from)
      cp "$PROJECT_DIR/apps/updater/update.sh"   /app/update.sh
      cp "$PROJECT_DIR/apps/updater/server.sh"    /app/server.sh
      cp "$PROJECT_DIR/apps/updater/check.sh"     /app/check.sh
      cp "$PROJECT_DIR/apps/updater/backup.sh"    /app/backup.sh
      cp "$PROJECT_DIR/apps/updater/rollback.sh"  /app/rollback.sh
      chmod +x /app/*.sh

      log "Scripts updated. Re-executing update pipeline with new scripts..."

      # Export state so the re-exec'd script can resume correctly
      export SELF_UPDATE_ROLLBACK_COMMIT="$ROLLBACK_COMMIT"
      export SELF_UPDATE_BACKUP_FILE="$BACKUP_FILE"
      export SELF_UPDATE_NEW_COMMIT="$NEW_COMMIT"
      export SELF_UPDATE_NEW_TAG="$NEW_TAG"
      export SELF_UPDATE_ROLLBACK_TAG="$ROLLBACK_TAG"
      export SELF_UPDATE_STARTED_AT="$UPDATE_STARTED_AT"
      export SELF_UPDATE_LOG_FILE="$LOG_FILE"

      # Re-exec with --self-updated flag (prevents infinite loop)
      exec /app/update.sh --self-updated
    else
      log "No updater script changes detected, continuing with current scripts"
    fi
  else
    log "Running with updated scripts (self-update already performed)"
    # Restore state from the previous execution
    if [ -n "${SELF_UPDATE_ROLLBACK_COMMIT:-}" ]; then
      ROLLBACK_COMMIT="$SELF_UPDATE_ROLLBACK_COMMIT"
      BACKUP_FILE="$SELF_UPDATE_BACKUP_FILE"
      NEW_COMMIT="$SELF_UPDATE_NEW_COMMIT"
      NEW_TAG="${SELF_UPDATE_NEW_TAG:-none}"
      ROLLBACK_TAG="${SELF_UPDATE_ROLLBACK_TAG:-none}"
      UPDATE_STARTED_AT="$SELF_UPDATE_STARTED_AT"
      LOG_FILE="${SELF_UPDATE_LOG_FILE:-$LOG_FILE}"
    fi
  fi

  # Step 6: Build Docker images
  write_status 6 $TOTAL_STEPS "Building containers" "running" "Rebuilding API and Web containers..."
  log "Step 6/$TOTAL_STEPS: Building Docker images (api, web)"

  if ! $COMPOSE_CMD build api web 2>>"$LOG_FILE"; then
    rollback "Docker build failed"
  fi
  IMAGES_BUILT=true
  log "Docker images built successfully"

  # Step 7: Database schema sync (prisma db push)
  write_status 7 $TOTAL_STEPS "Updating database schema" "running" "Running prisma db push..."
  log "Step 7/$TOTAL_STEPS: Running prisma db push"

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

  # Step 8: Restart services
  write_status 8 $TOTAL_STEPS "Restarting services" "running" "Starting updated containers..."
  log "Step 8/$TOTAL_STEPS: Restarting services (api, web, gotenberg)"

  if ! $COMPOSE_CMD up -d api web gotenberg 2>>"$LOG_FILE"; then
    rollback "Failed to restart services"
  fi
  log "Services restarted"

  # Step 9: Health check
  write_status 9 $TOTAL_STEPS "Health check" "running" "Verifying services are healthy..."
  log "Step 9/$TOTAL_STEPS: Health check (30s timeout)"

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

  # Step 10: Done — clear ERR trap since update succeeded
  trap - ERR
  write_status $TOTAL_STEPS $TOTAL_STEPS "Update complete" "success" "Successfully updated to $NEW_COMMIT"
  log "=========================================="
  log "✅ Update completed successfully!"
  log "   From: $ROLLBACK_COMMIT ($ROLLBACK_TAG)"
  log "   To:   $NEW_COMMIT ($NEW_TAG)"
  log "=========================================="

  # Clean up old Docker images (non-fatal)
  docker image prune -f 2>/dev/null || true
}

# Run main with output logging
main "$@" 2>&1 | tee -a "$LOG_FILE"
