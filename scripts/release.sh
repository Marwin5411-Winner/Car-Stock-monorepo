#!/bin/bash
set -e

# Release script for Car-Stock Monorepo
# Usage: ./scripts/release.sh [major|minor|patch]
# Example: ./scripts/release.sh patch  → 1.0.0 → 1.0.1

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"

if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: VERSION file not found at $VERSION_FILE"
  exit 1
fi

CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
echo "Current version: $CURRENT_VERSION"

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Determine bump type
BUMP_TYPE="${1:-patch}"
case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
  *)
    echo "Usage: $0 [major|minor|patch]"
    echo "  major  → x.0.0 (breaking changes)"
    echo "  minor  → 0.x.0 (new features)"
    echo "  patch  → 0.0.x (bug fixes)"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update VERSION file
echo "$NEW_VERSION" > "$VERSION_FILE"

# Update root package.json version
cd "$ROOT_DIR"
if command -v jq &> /dev/null; then
  tmp=$(mktemp)
  jq --arg v "$NEW_VERSION" '.version = $v' package.json > "$tmp" && mv "$tmp" package.json
else
  # Fallback: sed-based replacement
  sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
  rm -f package.json.bak
fi

# Git operations
git add VERSION package.json
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo ""
echo "✅ Version bumped to v$NEW_VERSION"
echo "📦 Commit and tag created locally."
echo ""
echo "To push the release:"
echo "  git push origin main --tags"
echo ""
echo "Or to push automatically, run:"
echo "  ./scripts/release.sh $BUMP_TYPE && git push origin main --tags"
