#!/bin/bash

# Lightweight HTTP API Server for the Updater Sidecar
# Endpoints:
#   GET  /check    - Check for available updates
#   POST /update   - Trigger update pipeline
#   GET  /status   - Get current update status
#   POST /rollback - Trigger manual rollback
#   GET  /backups  - List available backups
#   GET  /version  - Get current version info
#   GET  /health   - Health check for the updater itself

PORT="${UPDATER_PORT:-9000}"
UPDATE_SECRET="${UPDATE_SECRET:-}"
STATUS_DIR="/app/status"
STATUS_FILE="$STATUS_DIR/update-status.json"
BACKUP_DIR="/app/backups"
PROJECT_DIR="${PROJECT_PATH:-/app/project}"
UPDATE_LOCK="/tmp/update.lock"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [server] $1"
}

# Verify shared secret (if configured)
check_auth() {
  local auth_header="$1"
  if [ -n "$UPDATE_SECRET" ]; then
    if [ "$auth_header" != "Bearer $UPDATE_SECRET" ]; then
      return 1
    fi
  fi
  return 0
}

# Handle a single HTTP request
handle_request() {
  local method=""
  local path=""
  local auth_header=""
  local content_length=0
  local body=""

  # Read the request line
  read -r request_line
  method=$(echo "$request_line" | awk '{print $1}')
  path=$(echo "$request_line" | awk '{print $2}')

  # Read headers
  while IFS= read -r header; do
    header=$(echo "$header" | tr -d '\r\n')
    [ -z "$header" ] && break

    case "$header" in
      Authorization:*|authorization:*)
        auth_header=$(echo "$header" | sed 's/^[Aa]uthorization: *//')
        ;;
      Content-Length:*|content-length:*)
        content_length=$(echo "$header" | sed 's/^[Cc]ontent-[Ll]ength: *//' | tr -d '[:space:]')
        ;;
    esac
  done

  # Read body if present
  if [ "$content_length" -gt 0 ] 2>/dev/null; then
    body=$(dd bs=1 count="$content_length" 2>/dev/null)
  fi

  # Skip auth for health endpoint (needed by Docker healthcheck)
  if [ "$method $path" = "GET /health" ]; then
    send_response 200 '{"status": "ok", "service": "updater"}'
    return
  fi

  # Check authentication (all other endpoints)
  if ! check_auth "$auth_header"; then
    send_response 401 '{"error": "Unauthorized", "message": "Invalid or missing UPDATE_SECRET"}'
    return
  fi

  # Route requests
  case "$method $path" in

    "GET /check")
      handle_check
      ;;

    "POST /update")
      handle_update "$body"
      ;;

    "GET /status")
      handle_status
      ;;

    "POST /rollback")
      handle_rollback "$body"
      ;;

    "GET /backups")
      handle_backups
      ;;

    "GET /version")
      handle_version
      ;;

    *)
      send_response 404 '{"error": "Not Found", "message": "Unknown endpoint"}'
      ;;
  esac
}

send_response() {
  local status_code="$1"
  local body="$2"
  local status_text="OK"

  case "$status_code" in
    200) status_text="OK" ;;
    202) status_text="Accepted" ;;
    400) status_text="Bad Request" ;;
    401) status_text="Unauthorized" ;;
    404) status_text="Not Found" ;;
    409) status_text="Conflict" ;;
    500) status_text="Internal Server Error" ;;
  esac

  local content_length=${#body}
  printf "HTTP/1.1 %s %s\r\n" "$status_code" "$status_text"
  printf "Content-Type: application/json\r\n"
  printf "Content-Length: %s\r\n" "$content_length"
  printf "Connection: close\r\n"
  printf "Access-Control-Allow-Origin: *\r\n"
  printf "\r\n"
  printf "%s" "$body"
}

handle_check() {
  log "Checking for updates..."
  local result
  result=$(/app/check.sh 2>/dev/null)
  if [ $? -eq 0 ]; then
    send_response 200 "$result"
  else
    send_response 500 '{"error": "Failed to check for updates"}'
  fi
}

handle_update() {
  local body="$1"

  # Check if update is already running
  if [ -f "$UPDATE_LOCK" ]; then
    local lock_pid=$(cat "$UPDATE_LOCK" 2>/dev/null)
    if kill -0 "$lock_pid" 2>/dev/null; then
      send_response 409 '{"error": "Update already in progress", "message": "An update is currently running"}'
      return
    else
      # Stale lock file
      rm -f "$UPDATE_LOCK"
    fi
  fi

  # Start update in background
  log "Starting update pipeline..."
  (
    echo $BASHPID > "$UPDATE_LOCK"
    /app/update.sh
    rm -f "$UPDATE_LOCK"
  ) &

  send_response 202 '{"message": "Update started", "status": "running"}'
}

handle_status() {
  if [ -f "$STATUS_FILE" ]; then
    local status_content
    status_content=$(cat "$STATUS_FILE")
    send_response 200 "$status_content"
  else
    send_response 200 '{"step": 0, "totalSteps": 0, "stepName": "idle", "status": "idle", "message": "No update in progress"}'
  fi
}

handle_rollback() {
  local body="$1"

  # Check if update is running
  if [ -f "$UPDATE_LOCK" ]; then
    local lock_pid=$(cat "$UPDATE_LOCK" 2>/dev/null)
    if kill -0 "$lock_pid" 2>/dev/null; then
      send_response 409 '{"error": "Cannot rollback while update is in progress"}'
      return
    fi
  fi

  # Parse optional commit and backup from body
  local target_commit=""
  local backup_file=""
  if [ -n "$body" ]; then
    target_commit=$(echo "$body" | jq -r '.commit // empty' 2>/dev/null || echo "")
    backup_file=$(echo "$body" | jq -r '.backupFile // empty' 2>/dev/null || echo "")
  fi

  # Validate backup file path (defense-in-depth)
  if [ -n "$backup_file" ] && [[ "$backup_file" != /app/backups/* ]]; then
    send_response 400 '{"error": "Invalid backup file path"}'
    return
  fi

  log "Starting manual rollback... commit=$target_commit backup=$backup_file"
  (
    echo $BASHPID > "$UPDATE_LOCK"
    /app/rollback.sh "$target_commit" "$backup_file"
    rm -f "$UPDATE_LOCK"
  ) &

  send_response 202 '{"message": "Rollback started", "status": "rolling_back"}'
}

handle_backups() {
  local backups="[]"
  if [ -d "$BACKUP_DIR" ]; then
    backups=$(ls -1t "$BACKUP_DIR"/car-stock_*.dump 2>/dev/null | while read -r f; do
      local filename=$(basename "$f")
      local size=$(du -h "$f" | cut -f1)
      local modified=$(stat -c '%Y' "$f" 2>/dev/null || stat -f '%m' "$f" 2>/dev/null || echo "0")
      printf '{"filename":"%s","path":"%s","size":"%s","timestamp":%s}' "$filename" "$f" "$size" "$modified"
    done | jq -s '.' 2>/dev/null || echo "[]")
  fi
  send_response 200 "{\"backups\": $backups}"
}

handle_version() {
  cd "$PROJECT_DIR" 2>/dev/null || {
    send_response 500 '{"error": "Project directory not found"}'
    return
  }

  local commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  local full_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
  local tag=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "")
  local date=$(git log -1 --format="%ci" HEAD 2>/dev/null || echo "unknown")
  local version=""
  if [ -f "VERSION" ]; then
    version=$(cat VERSION | tr -d '[:space:]')
  fi

  local json
  json=$(printf '{"version":"%s","commit":"%s","fullCommit":"%s","tag":"%s","date":"%s"}' \
    "$version" "$commit" "$full_commit" "$tag" "$date")
  send_response 200 "$json"
}

# --- Entry Point ---

# If called with __handle, process a single HTTP request and exit
if [ "$1" = "__handle" ]; then
  handle_request
  exit 0
fi

# --- Main Server Loop ---

log "Starting updater HTTP server on port $PORT"
log "Project directory: $PROJECT_DIR"
log "Update branch: ${UPDATE_BRANCH:-main}"
log "Auth: $([ -n "$UPDATE_SECRET" ] && echo "enabled" || echo "disabled (no UPDATE_SECRET)")"

mkdir -p "$STATUS_DIR" "$BACKUP_DIR" /app/logs

# Use socat to handle HTTP connections
# Each connection forks a new process calling this script with __handle
exec socat TCP-LISTEN:$PORT,reuseaddr,fork SYSTEM:"bash /app/server.sh __handle"
