#!/bin/bash
set -e

# Check for Updates Script
# Compares local HEAD with remote HEAD on configured branch
# Outputs JSON with update info

PROJECT_DIR="${PROJECT_PATH:-/app/project}"
BRANCH="${UPDATE_BRANCH:-main}"

cd "$PROJECT_DIR"

# Ensure we're in a git repo
if [ ! -d ".git" ]; then
  echo '{"error": "Not a git repository"}'
  exit 1
fi

# Fetch latest from remote (without merging)
git fetch origin "$BRANCH" 2>/dev/null

# Get current commit info
CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_SHORT=$(git rev-parse --short HEAD)
CURRENT_DATE=$(git log -1 --format="%ci" HEAD)

# Get current version tag (if any)
CURRENT_TAG=$(git describe --tags --exact-match HEAD 2>/dev/null || echo "")
CURRENT_VERSION=""
if [ -f "VERSION" ]; then
  CURRENT_VERSION=$(cat VERSION | tr -d '[:space:]')
fi

# Get remote commit info
REMOTE_COMMIT=$(git rev-parse "origin/$BRANCH")
REMOTE_SHORT=$(git rev-parse --short "origin/$BRANCH")
REMOTE_DATE=$(git log -1 --format="%ci" "origin/$BRANCH")

# Get remote version tag (if any)
REMOTE_TAG=$(git describe --tags --exact-match "origin/$BRANCH" 2>/dev/null || echo "")

# Check if update is available
HAS_UPDATE="false"
if [ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" ]; then
  HAS_UPDATE="true"
fi

# Get changelog (commits between current and remote) — use jq for safe JSON construction
CHANGELOG="[]"
if [ "$HAS_UPDATE" = "true" ]; then
  CHANGELOG=$(git log --format='%h%x00%s%x00%an%x00%ci' "$CURRENT_COMMIT..$REMOTE_COMMIT" 2>/dev/null | \
    jq -R -s 'split("\n") | map(select(. != "") | split("\u0000") | {hash:.[0], message:.[1], author:.[2], date:.[3]})' 2>/dev/null || echo "[]")
fi

# Get commit count
COMMIT_COUNT=0
if [ "$HAS_UPDATE" = "true" ]; then
  COMMIT_COUNT=$(git rev-list --count "$CURRENT_COMMIT..$REMOTE_COMMIT" 2>/dev/null || echo "0")
fi

# Output JSON
cat <<EOF
{
  "hasUpdate": $HAS_UPDATE,
  "currentCommit": "$CURRENT_SHORT",
  "currentFullCommit": "$CURRENT_COMMIT",
  "currentDate": "$CURRENT_DATE",
  "currentTag": "$CURRENT_TAG",
  "currentVersion": "$CURRENT_VERSION",
  "latestCommit": "$REMOTE_SHORT",
  "latestFullCommit": "$REMOTE_COMMIT",
  "latestDate": "$REMOTE_DATE",
  "latestTag": "$REMOTE_TAG",
  "branch": "$BRANCH",
  "commitCount": $COMMIT_COUNT,
  "changelog": $CHANGELOG
}
EOF
