#!/usr/bin/env bash
# Remote deploy script for the Test Server.
# Intended to run ON the server (via GitHub Actions SSH), not on the developer laptop.
#
# What it does:
#   1. Pull latest code from origin/<branch>
#   2. Rebuild & restart Docker stack (api + web; postgres stays)
#   3. Wait for API (/health) and web health
#   4. Print commit + container status
#
# Env (optional):
#   DEPLOY_PATH     Absolute path to the repo on the server (default: cwd)
#   DEPLOY_BRANCH   Git branch to deploy (default: main)
#   ENV_FILE        docker compose env file (default: .env.docker)
#   API_HEALTH_URL  API health URL (default: http://127.0.0.1:3001/health)
#   WEB_HEALTH_URL  Web health URL (default: http://127.0.0.1/health)
#   HEALTH_RETRIES  Health poll attempts (default: 36 → ~3 min at 5s)
#   HEALTH_SLEEP    Seconds between polls (default: 5)
#   SKIP_BUILD      If "1", only restart without --build
#
# Exit codes: 0 success, non-zero failure

set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-.}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
ENV_FILE="${ENV_FILE:-.env.docker}"
API_HEALTH_URL="${API_HEALTH_URL:-http://127.0.0.1:3001/health}"
WEB_HEALTH_URL="${WEB_HEALTH_URL:-http://127.0.0.1/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-36}"
HEALTH_SLEEP="${HEALTH_SLEEP:-5}"
SKIP_BUILD="${SKIP_BUILD:-0}"

# Match docker-compose project name used by apps/updater/update.sh
COMPOSE_PROJECT="${COMPOSE_PROJECT:-car-stock-monorepo}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

wait_http() {
  local url="$1"
  local name="$2"
  local i
  for i in $(seq 1 "$HEALTH_RETRIES"); do
    if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
      log "$name healthy ($url)"
      return 0
    fi
    log "Waiting for $name... ($i/$HEALTH_RETRIES)"
    sleep "$HEALTH_SLEEP"
  done
  return 1
}

# --- preflight ---
require_cmd git
require_cmd docker
require_cmd curl

cd "$DEPLOY_PATH" || die "Cannot cd to DEPLOY_PATH=$DEPLOY_PATH"
DEPLOY_PATH="$(pwd -P)"
log "Deploy path: $DEPLOY_PATH"

if [ ! -f "$ENV_FILE" ]; then
  die "Env file not found: $DEPLOY_PATH/$ENV_FILE"
fi

if [ ! -f docker-compose.yml ]; then
  die "docker-compose.yml not found in $DEPLOY_PATH"
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -p "$COMPOSE_PROJECT" -f docker-compose.yml)

# --- git ---
log "Fetching origin/$DEPLOY_BRANCH..."
git fetch origin "$DEPLOY_BRANCH" || die "git fetch failed (check remote credentials on the server)"

# Avoid deploy blocked by local dirty tree on a shared test box
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  log "WARNING: working tree dirty — stashing before hard reset"
  git stash push -u -m "auto-deploy-stash-$(date +%Y%m%d%H%M%S)" || true
fi

git checkout "$DEPLOY_BRANCH" 2>/dev/null || git checkout -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
git reset --hard "origin/$DEPLOY_BRANCH" || die "git reset --hard failed"

COMMIT_SHORT="$(git rev-parse --short HEAD)"
COMMIT_MSG="$(git log -1 --pretty=%s)"
COMMIT_FULL="$(git rev-parse HEAD)"
log "Deploying $COMMIT_SHORT — $COMMIT_MSG"

# --- docker ---
log "Docker: ensure stack is up"
if [ "$SKIP_BUILD" = "1" ]; then
  "${COMPOSE[@]}" up -d --remove-orphans
else
  # Cached rebuild — fast enough for every push to main
  "${COMPOSE[@]}" up -d --build --remove-orphans
fi

# --- health ---
log "Health checks..."
if ! wait_http "$API_HEALTH_URL" "API"; then
  log "--- api logs (last 80 lines) ---"
  "${COMPOSE[@]}" logs --tail=80 api || true
  die "API health check failed: $API_HEALTH_URL"
fi

# Web is nice-to-have; some test boxes map a non-80 port
if ! wait_http "$WEB_HEALTH_URL" "Web"; then
  # Fallback common alt
  if ! wait_http "http://127.0.0.1:80/health" "Web(:80)"; then
    log "WARNING: Web health check failed (continuing — API is up)"
  fi
fi

log "Container status:"
"${COMPOSE[@]}" ps

log "=========================================="
log "Deploy OK"
log "  branch : $DEPLOY_BRANCH"
log "  commit : $COMMIT_SHORT ($COMMIT_FULL)"
log "  message: $COMMIT_MSG"
log "=========================================="
