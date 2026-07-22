#!/bin/bash
set -e

# Release script for Car-Stock Monorepo
# Usage: ./scripts/release.sh [major|minor|patch] [--publish]
#   --publish  also push, build the portable Windows zip, and upload it as a GitHub release
# Example: ./scripts/release.sh patch --publish

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$ROOT_DIR/VERSION"

if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: VERSION file not found at $VERSION_FILE"
  exit 1
fi

PUBLISH=false
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --publish) PUBLISH=true ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [ "$PUBLISH" = true ] && ! command -v gh &> /dev/null; then
  echo "Error: --publish requires the GitHub CLI (gh), not found in PATH" >&2
  exit 1
fi

CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
echo "Current version: $CURRENT_VERSION"

# Parse current version
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Determine bump type
BUMP_TYPE="${ARGS[0]:-patch}"
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
    echo "Usage: $0 [major|minor|patch] [--publish]"
    echo "  major  → x.0.0 (breaking changes)"
    echo "  minor  → 0.x.0 (new features)"
    echo "  patch  → 0.0.x (bug fixes)"
    echo "  --publish  push + build portable Windows zip + upload GitHub release"
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

if [ "$PUBLISH" = false ]; then
  echo ""
  echo "To push the release:"
  echo "  git push origin main --tags"
  echo ""
  echo "Or re-run with --publish to push + build + upload the Windows package automatically."
  exit 0
fi

echo ""
echo "==> Pushing commit + tag"
git push origin main --tags

echo "==> Building portable Windows package"
"$SCRIPT_DIR/pack-windows.sh" --zip

ZIP="$ROOT_DIR/dist/vbeyond-windows-v${NEW_VERSION}.zip"
SHA="$ZIP.sha256"
if [ ! -f "$ZIP" ]; then
  echo "ERROR: $ZIP was not produced by pack-windows.sh" >&2
  exit 1
fi

echo "==> Creating GitHub release v${NEW_VERSION}"
FEED="$ROOT_DIR/dist/feed.json"
ASSETS=("$ZIP")
[ -f "$SHA" ] && ASSETS+=("$SHA")
# Customers point UPDATE_FEED_URL at .../releases/latest/download/feed.json — without this
# asset every "check for updates" 404s.
[ -f "$FEED" ] && ASSETS+=("$FEED")
gh release create "v${NEW_VERSION}" "${ASSETS[@]}" \
  --title "v${NEW_VERSION}" \
  --notes "Portable Windows package v${NEW_VERSION}"

echo ""
echo "✅ Released v${NEW_VERSION}"
