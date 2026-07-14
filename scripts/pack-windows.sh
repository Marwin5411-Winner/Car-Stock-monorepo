#!/usr/bin/env bash
# Assemble a portable Windows package folder (and optional zip).
# Full Windows binary/prisma engines should ideally be produced on a Windows runner;
# this script builds the app artifacts and layout for packaging.
#
# Usage (from repo root):
#   ./scripts/pack-windows.sh
#   ./scripts/pack-windows.sh --zip
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION)"
OUT_NAME="vbeyond-windows-v${VERSION}"
OUT_DIR="${ROOT_DIR}/dist/${OUT_NAME}"
DO_ZIP=false
for arg in "$@"; do
  case "$arg" in
    --zip) DO_ZIP=true ;;
  esac
done

echo "==> Packing ${OUT_NAME}"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"/{app,config,data/{logs/app,logs/updater,backups,status,cache},releases,staging,secrets,updater,tools}

echo "==> Install / build"
bun install
bun run build:web
(
  cd apps/api
  bunx prisma generate
  bun run build
)

echo "==> Copy web → app/public"
mkdir -p "$OUT_DIR/app/public"
cp -R apps/web/dist/. "$OUT_DIR/app/public/"

echo "==> Copy API dist + prisma"
cp -R apps/api/dist "$OUT_DIR/app/dist"
mkdir -p "$OUT_DIR/app/prisma"
cp apps/api/prisma/schema.prisma "$OUT_DIR/app/prisma/"
cp -R apps/api/prisma/migrations "$OUT_DIR/app/prisma/"
if [ -f apps/api/prisma/seed.ts ]; then
  cp apps/api/prisma/seed.ts "$OUT_DIR/app/prisma/" || true
fi

# Templates / public assets used by API (receipts etc.)
if [ -d apps/api/public ]; then
  # Keep SPA in public/; merge non-conflicting API public files under public/api-assets if needed
  mkdir -p "$OUT_DIR/app/public"
  # copy API static assets that are not index.html
  find apps/api/public -type f ! -name 'index.html' -exec cp {} "$OUT_DIR/app/public/" \; 2>/dev/null || true
fi
if [ -d apps/api/src/modules ]; then
  # Handlebars templates live under modules — copy for runtime if referenced by relative path
  mkdir -p "$OUT_DIR/app/src/modules"
  # Prefer shipping only templates
  rsync -a --include='*/' --include='*.hbs' --include='*.png' --include='*.html' --exclude='*' \
    apps/api/src/modules/ "$OUT_DIR/app/src/modules/" 2>/dev/null || \
    cp -R apps/api/src/modules "$OUT_DIR/app/src/" 2>/dev/null || true
fi

echo "==> VERSION + manifest"
echo "$VERSION" > "$OUT_DIR/app/VERSION"
GIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$OUT_DIR/app/package-manifest.json" <<EOF
{
  "name": "vbeyond-windows",
  "version": "${VERSION}",
  "builtAt": "${BUILT_AT}",
  "gitSha": "${GIT_SHA}",
  "minPostgresVersion": "14",
  "runner": "bun-dist-fallback"
}
EOF

echo "==> Portable scripts from portable/windows"
cp portable/windows/start.bat "$OUT_DIR/"
cp portable/windows/stop.bat "$OUT_DIR/"
cp portable/windows/setup.bat "$OUT_DIR/"
cp portable/windows/install-service.ps1 "$OUT_DIR/"
cp portable/windows/uninstall-service.ps1 "$OUT_DIR/"
cp portable/windows/config/.env.example "$OUT_DIR/config/"
cp portable/windows/app/run.cmd "$OUT_DIR/app/"
cp portable/windows/updater/*.ps1 "$OUT_DIR/updater/"

# Placeholder feed sample for offline docs
cat > "$OUT_DIR/config/feed.example.json" <<EOF
{
  "channel": "stable",
  "latest": "${VERSION}",
  "releases": [
    {
      "version": "${VERSION}",
      "publishedAt": "${BUILT_AT}",
      "notes": "Local package",
      "assetUrl": "https://example.com/releases/vbeyond-windows-v${VERSION}.zip",
      "sha256": "REPLACE_AFTER_ZIP",
      "minVersion": "1.0.0"
    }
  ]
}
EOF

cat > "$OUT_DIR/README.txt" <<EOF
VBeyond portable Windows package v${VERSION}

1. Install PostgreSQL and create database "car_stock".
2. Copy config\\.env.example to config\\.env and edit DATABASE_URL, JWT_SECRET, CORS_ORIGIN.
3. Place bun.exe for Windows into app\\ (or compile vbeyond-api.exe on a Windows builder).
4. Run setup.bat  (migrate)
5. Run start.bat  (or install-service.ps1 as Administrator with NSSM)

See docs/portable-windows-install.md in the source repo.
EOF

if [ "$DO_ZIP" = true ]; then
  echo "==> Zip"
  (
    cd "${ROOT_DIR}/dist"
    if command -v zip >/dev/null 2>&1; then
      rm -f "${OUT_NAME}.zip"
      zip -r "${OUT_NAME}.zip" "${OUT_NAME}"
      echo "Created dist/${OUT_NAME}.zip"
    else
      echo "zip not found; folder left at dist/${OUT_NAME}"
    fi
  )
fi

echo "Done: ${OUT_DIR}"
echo "Note: Add Windows bun.exe or vbeyond-api.exe under app/ before shipping to customers."
