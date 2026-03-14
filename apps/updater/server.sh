#!/bin/bash

# Lightweight HTTP API Server for the Updater Sidecar
# Endpoints:
#   GET  /check      - Check for available updates
#   POST /update     - Trigger update pipeline
#   GET  /status     - Get current update status (includes last 50 log lines)
#   POST /rollback   - Trigger manual rollback
#   GET  /backups    - List available backups
#   GET  /version    - Get current version info
#   GET  /logs       - List recent log files
#   GET  /logs/:file - View last 100 lines of a specific log file
#   GET  /health     - Health check for the updater itself

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

  # Read the request line (5s timeout for dead connections)
  if ! read -r -t 5 request_line; then
    return
  fi
  request_line=$(echo "$request_line" | tr -d '\r')
  method=$(echo "$request_line" | awk '{print $1}')
  path=$(echo "$request_line" | awk '{print $2}')

  # Bail out if we got an empty or malformed request
  if [ -z "$method" ] || [ -z "$path" ]; then
    return
  fi

  # Read headers
  while IFS= read -r -t 5 header; do
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

    "GET /logs")
      handle_logs
      ;;

    "GET /logs/"*)
      handle_log_file "${path#/logs/}"
      ;;

    *)
      send_response 404 '{"error": "Not Found", "message": "Unknown endpoint. Available: GET /check, POST /update, GET /status, POST /rollback, GET /backups, GET /version, GET /logs, GET /health"}'
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
  local response
  response=$(printf "HTTP/1.1 %s %s\r\nContent-Type: application/json\r\nContent-Length: %s\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n%s" \
    "$status_code" "$status_text" "$content_length" "$body")
  printf "%s" "$response" 2>/dev/null
}

handle_check() {
  log "Checking for updates..."
  local result
  local error_output
  error_output=$(mktemp)
  if result=$(/app/check.sh 2>"$error_output"); then
    send_response 200 "$result"
  else
    local err_msg
    err_msg=$(tail -5 "$error_output" | tr '\n' ' ' | sed 's/"/\\"/g')
    log "Check failed: $err_msg"
    send_response 500 "{\"error\": \"Failed to check for updates\", \"details\": \"$err_msg\"}"
  fi
  rm -f "$error_output"
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
    /app/update.sh 2>&1
    exit_code=$?
    rm -f "$UPDATE_LOCK"
    if [ $exit_code -ne 0 ]; then
      log "Update pipeline exited with code $exit_code"
    fi
  ) &

  send_response 202 '{"message": "Update started", "status": "running", "hint": "Use GET /status to monitor progress, GET /logs to see detailed output"}'
}

handle_status() {
  if [ -f "$STATUS_FILE" ]; then
    local status_content
    status_content=$(cat "$STATUS_FILE")
    send_response 200 "$status_content"
  else
    # Check if there are any past logs to hint at
    local latest_log
    latest_log=$(ls -1t /app/logs/*.log 2>/dev/null | head -1 || echo "")
    if [ -n "$latest_log" ]; then
      local log_name=$(basename "$latest_log")
      send_response 200 "{\"step\": 0, \"totalSteps\": 0, \"stepName\": \"idle\", \"status\": \"idle\", \"message\": \"No update in progress\", \"lastLog\": \"$log_name\", \"hint\": \"Use GET /logs/$log_name to see the last update log\"}"
    else
      send_response 200 '{"step": 0, "totalSteps": 0, "stepName": "idle", "status": "idle", "message": "No update in progress"}'
    fi
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

handle_logs() {
  local log_dir="/app/logs"
  if [ ! -d "$log_dir" ]; then
    send_response 200 '{"logs": []}'
    return
  fi

  local logs
  logs=$(ls -1t "$log_dir"/*.log 2>/dev/null | head -20 | while read -r f; do
    local filename=$(basename "$f")
    local size=$(du -h "$f" | cut -f1)
    local lines=$(wc -l < "$f" 2>/dev/null || echo "0")
    local last_line=$(tail -1 "$f" 2>/dev/null | sed 's/"/\\"/g' | head -c 200)
    printf '{"filename":"%s","size":"%s","lines":%s,"lastEntry":"%s"}' "$filename" "$size" "$lines" "$last_line"
  done | jq -s '.' 2>/dev/null || echo "[]")

  send_response 200 "{\"logs\": $logs}"
}

handle_log_file() {
  local filename="$1"
  local log_path="/app/logs/$filename"

  # Defense-in-depth: prevent path traversal
  case "$filename" in
    *..* | */* ) send_response 400 '{"error": "Invalid log filename"}'; return ;;
  esac

  if [ ! -f "$log_path" ]; then
    send_response 404 '{"error": "Log file not found"}'
    return
  fi

  # Return last 100 lines as JSON array
  local content
  content=$(tail -100 "$log_path" 2>/dev/null | jq -R -s 'split("\n") | map(select(. != ""))' 2>/dev/null || echo '[]')
  send_response 200 "{\"filename\": \"$filename\", \"lines\": $content}"
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

# Clean shutdown on SIGTERM (container stop)
trap 'log "Shutting down updater server"; exit 0' TERM INT

# Use socat to handle HTTP connections
# Each connection forks a new process calling this script with __handle
# stderr suppressed: socat logs "Connection reset by peer" for TCP probes (expected)
exec socat TCP-LISTEN:$PORT,reuseaddr,fork SYSTEM:"bash /app/server.sh __handle" 2>/dev/null
