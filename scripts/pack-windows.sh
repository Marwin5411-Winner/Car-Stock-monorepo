#!/usr/bin/env bash
# Build a complete portable Windows package (ready to ship).
#
# Produces:
#   dist/vbeyond-windows-v{VERSION}/
#     app/vbeyond-api.exe          # cross-compiled Bun binary
#     app/bun.exe                  # official Bun for Windows (migrate/tools)
#     app/engines/*                # Prisma Windows query + schema engines
#     app/public/                  # built React SPA
#     app/prisma/                  # schema + migrations
#     app/node_modules/{prisma,@prisma,.prisma}  # offline migrate CLI
#     start.bat / stop.bat / setup.bat / updater / config
#
# Usage (repo root):
#   ./scripts/pack-windows.sh
#   ./scripts/pack-windows.sh --zip
#   ./scripts/pack-windows.sh --zip --skip-download   # reuse cached downloads
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION)"
OUT_NAME="vbeyond-windows-v${VERSION}"
OUT_DIR="${ROOT_DIR}/dist/${OUT_NAME}"
CACHE_DIR="${ROOT_DIR}/dist/.cache-windows-pack"
DO_ZIP=false
SKIP_DOWNLOAD=false
for arg in "$@"; do
  case "$arg" in
    --zip) DO_ZIP=true ;;
    --skip-download) SKIP_DOWNLOAD=true ;;
  esac
done

BUN_VERSION="$(bun --version)"
# Prisma engines commit (must match installed @prisma/engines-version)
ENGINES_VERSION="$(
  node -e "console.log(require('@prisma/engines-version').enginesVersion || require('@prisma/engines-version').prismaVersion?.enginesVersion || '')" 2>/dev/null \
    || true
)"
if [ -z "${ENGINES_VERSION}" ]; then
  ENGINES_VERSION="$(
    node -p "require('./node_modules/@prisma/engines-version/package.json').prisma.enginesVersion" 2>/dev/null \
      || true
  )"
fi
if [ -z "${ENGINES_VERSION}" ]; then
  # fallback matching package in lock (current monorepo)
  ENGINES_VERSION="2ba551f319ab1df4bc874a89965d8b3641056773"
fi

PRISMA_PKG_VERSION="$(node -p "require('./node_modules/prisma/package.json').version" 2>/dev/null || echo "6.19.0")"

echo "==> Packing ${OUT_NAME}"
echo "    Bun ${BUN_VERSION} | Prisma engines ${ENGINES_VERSION} | prisma ${PRISMA_PKG_VERSION}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"/{app/{public,prisma,engines,tools,dist,scripts},config,data/{logs/app,logs/updater,backups,status,cache},releases,staging,secrets,updater,tools}
mkdir -p "$CACHE_DIR"

download() {
  local url="$1"
  local dest="$2"
  if [ "$SKIP_DOWNLOAD" = true ] && [ -f "$dest" ]; then
    echo "    (cache) $(basename "$dest")"
    return 0
  fi
  echo "    download $(basename "$dest")"
  curl -fsSL --retry 3 --retry-delay 2 -o "$dest" "$url"
}

# --- 1. Install & build web/api sources ---
echo "==> Install / build apps"
bun install --frozen-lockfile 2>/dev/null || bun install
bun run build:web

echo "==> Prisma generate (native + debian + windows)"
(
  cd apps/api
  bunx prisma generate
)

# --- 2. Cross-compile Windows API executable ---
echo "==> Cross-compile vbeyond-api.exe (bun-windows-x64)"
(
  cd apps/api
  # Note: --windows-hide-console / icon metadata only work when compiling ON Windows.
  # Cross-compile from macOS/Linux uses --target only.
  # --define is mandatory: bun resolves process.env.NODE_ENV at BUILD time, so without it
  # the shipped exe froze to development — dev pino transport (crashes in a compiled
  # binary) and a dead "JWT_SECRET required in production" guard. See step 9 asserts.
  bun build \
    --compile \
    --target=bun-windows-x64 \
    --define process.env.NODE_ENV='"production"' \
    --outfile "${OUT_DIR}/app/vbeyond-api.exe" \
    src/index.ts
)

# Also keep JS dist as fallback / debug
(
  cd apps/api
  bun run build
)
cp -R apps/api/dist/. "$OUT_DIR/app/dist/"

# --- 3. Official Bun for Windows (migrate / seed / prisma CLI host) ---
echo "==> Fetch bun.exe for Windows x64"
BUN_ZIP="${CACHE_DIR}/bun-windows-x64-${BUN_VERSION}.zip"
download \
  "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-windows-x64.zip" \
  "$BUN_ZIP"
BUN_EXTRACT="${CACHE_DIR}/bun-windows-extract-${BUN_VERSION}"
rm -rf "$BUN_EXTRACT"
mkdir -p "$BUN_EXTRACT"
unzip -qo "$BUN_ZIP" -d "$BUN_EXTRACT"
# zip layout: bun-windows-x64/bun.exe
if [ -f "$BUN_EXTRACT/bun-windows-x64/bun.exe" ]; then
  cp "$BUN_EXTRACT/bun-windows-x64/bun.exe" "$OUT_DIR/app/bun.exe"
elif [ -f "$BUN_EXTRACT/bun.exe" ]; then
  cp "$BUN_EXTRACT/bun.exe" "$OUT_DIR/app/bun.exe"
else
  find "$BUN_EXTRACT" -name 'bun.exe' -print -quit | while read -r f; do cp "$f" "$OUT_DIR/app/bun.exe"; done
fi
test -f "$OUT_DIR/app/bun.exe" || { echo "ERROR: bun.exe not found in zip"; exit 1; }

# --- 4. Prisma Windows engines ---
echo "==> Prisma Windows engines"
QUERY_ENGINE_SRC="${ROOT_DIR}/node_modules/.prisma/client/query_engine-windows.dll.node"
if [ ! -f "$QUERY_ENGINE_SRC" ]; then
  # download if generate missed it
  QE_GZ="${CACHE_DIR}/query_engine.dll.node.gz"
  download \
    "https://binaries.prisma.sh/all_commits/${ENGINES_VERSION}/windows/query_engine.dll.node.gz" \
    "$QE_GZ"
  gunzip -c "$QE_GZ" > "$OUT_DIR/app/engines/query_engine-windows.dll.node"
else
  cp "$QUERY_ENGINE_SRC" "$OUT_DIR/app/engines/query_engine-windows.dll.node"
fi

SE_GZ="${CACHE_DIR}/schema-engine.exe.gz"
download \
  "https://binaries.prisma.sh/all_commits/${ENGINES_VERSION}/windows/schema-engine.exe.gz" \
  "$SE_GZ"
gunzip -c "$SE_GZ" > "$OUT_DIR/app/engines/schema-engine-windows.exe"
chmod +x "$OUT_DIR/app/engines/schema-engine-windows.exe" || true

# --- 5. Web SPA + prisma schema/migrations + templates ---
echo "==> Copy SPA + prisma assets"
cp -R apps/web/dist/. "$OUT_DIR/app/public/"
cp apps/api/prisma/schema.prisma "$OUT_DIR/app/prisma/"
cp -R apps/api/prisma/migrations "$OUT_DIR/app/prisma/"
# Run by setup.bat and by the updater's Migrate step before `migrate deploy`. Reconciles
# _prisma_migrations with what is actually in the database so a drifted customer install
# (db push, restored dump, renamed folder, failed migration) can still deploy.
cp apps/api/scripts/auto-resolve-migrations.ts "$OUT_DIR/app/scripts/"
if [ -f apps/api/prisma/seed.ts ]; then
  cp apps/api/prisma/seed.ts "$OUT_DIR/app/prisma/" || true
fi
# API static extras (receipt backgrounds, etc.)
if [ -d apps/api/public ]; then
  find apps/api/public -type f ! -name 'index.html' -print0 2>/dev/null \
    | while IFS= read -r -d '' f; do
        rel="${f#apps/api/public/}"
        mkdir -p "$OUT_DIR/app/public/$(dirname "$rel")"
        cp "$f" "$OUT_DIR/app/public/$rel"
      done
fi
# Handlebars / module assets needed at runtime by relative paths
if [ -d apps/api/src/modules ]; then
  mkdir -p "$OUT_DIR/app/src/modules"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --include='*/' --include='*.hbs' --include='*.png' --include='*.html' --include='*.jpg' --exclude='*' \
      apps/api/src/modules/ "$OUT_DIR/app/src/modules/"
  else
    # fallback: copy module tree (larger)
    cp -R apps/api/src/modules/. "$OUT_DIR/app/src/modules/"
  fi
fi

# --- 6. Offline Prisma CLI (for setup.bat migrate deploy) ---
echo "==> Vendor Prisma CLI for Windows migrate"
MIGRATE_DIR="$OUT_DIR/app/tools/migrate"
mkdir -p "$MIGRATE_DIR"
cat > "$MIGRATE_DIR/package.json" <<EOF
{
  "name": "vbeyond-migrate-tools",
  "private": true,
  "type": "module",
  "dependencies": {
    "prisma": "${PRISMA_PKG_VERSION}",
    "@prisma/client": "${PRISMA_PKG_VERSION}"
  }
}
EOF
# Install with host bun (downloads package code; engines overridden by env on Windows)
(
  cd "$MIGRATE_DIR"
  bun install
)

# Point packaged client engines at Windows query engine copy
mkdir -p "$MIGRATE_DIR/node_modules/.prisma/client"
if [ -d "$ROOT_DIR/node_modules/.prisma/client" ]; then
  # copy JS client stubs + windows engine only (skip huge darwin/debian if present to save space later)
  cp "$ROOT_DIR/node_modules/.prisma/client/"*.js \
     "$ROOT_DIR/node_modules/.prisma/client/"*.ts \
     "$ROOT_DIR/node_modules/.prisma/client/"*.mjs \
     "$ROOT_DIR/node_modules/.prisma/client/package.json" \
     "$ROOT_DIR/node_modules/.prisma/client/schema.prisma" \
     "$MIGRATE_DIR/node_modules/.prisma/client/" 2>/dev/null || true
fi
cp "$OUT_DIR/app/engines/query_engine-windows.dll.node" \
  "$MIGRATE_DIR/node_modules/.prisma/client/query_engine-windows.dll.node"

# Also place engines next to app for default Prisma lookup from compiled binary cwd
cp "$OUT_DIR/app/engines/query_engine-windows.dll.node" \
  "$OUT_DIR/app/query_engine-windows.dll.node"
mkdir -p "$OUT_DIR/app/node_modules/.prisma/client"
cp "$OUT_DIR/app/engines/query_engine-windows.dll.node" \
  "$OUT_DIR/app/node_modules/.prisma/client/query_engine-windows.dll.node"
# minimal client index for path joins some builds use
if [ -f "$ROOT_DIR/node_modules/.prisma/client/package.json" ]; then
  cp "$ROOT_DIR/node_modules/.prisma/client/package.json" \
    "$OUT_DIR/app/node_modules/.prisma/client/" 2>/dev/null || true
  cp "$ROOT_DIR/node_modules/.prisma/client/schema.prisma" \
    "$OUT_DIR/app/node_modules/.prisma/client/" 2>/dev/null || true
fi

# --- 6b. NSSM (service manager for install-service.ps1) ---
# Shipped, not left to the customer: without nssm.exe install-service.ps1 hard-throws, so
# every "auto-start on boot" install stalled on a manual nssm.cc download on the customer's
# server. 331KB, public domain. Pinned by sha256 — this binary runs as LocalSystem.
echo "==> Vendor NSSM (win64)"
NSSM_ZIP="${CACHE_DIR}/nssm-2.24.zip"
NSSM_SHA256="727d1e42275c605e0f04aba98095c38a8e1e46def453cdffce42869428aa6743"
download "https://nssm.cc/release/nssm-2.24.zip" "$NSSM_ZIP"
if command -v shasum >/dev/null 2>&1; then
  NSSM_GOT="$(shasum -a 256 "$NSSM_ZIP" | awk '{print $1}')"
else
  NSSM_GOT="$(sha256sum "$NSSM_ZIP" | awk '{print $1}')"
fi
if [ "$NSSM_GOT" != "$NSSM_SHA256" ]; then
  echo "ERROR: nssm-2.24.zip sha256 mismatch"
  echo "  expected ${NSSM_SHA256}"
  echo "  got      ${NSSM_GOT}"
  exit 1
fi
NSSM_EXTRACT="${CACHE_DIR}/nssm-extract"
rm -rf "$NSSM_EXTRACT"
mkdir -p "$NSSM_EXTRACT"
unzip -qo "$NSSM_ZIP" -d "$NSSM_EXTRACT"
cp "$NSSM_EXTRACT/nssm-2.24/win64/nssm.exe" "$OUT_DIR/tools/nssm.exe"
cp "$NSSM_EXTRACT/nssm-2.24/README.txt" "$OUT_DIR/tools/nssm-LICENSE.txt"

# --- 7. Portable scripts ---
echo "==> Portable scripts"
cp portable/windows/start.bat "$OUT_DIR/"
cp portable/windows/stop.bat "$OUT_DIR/"
cp portable/windows/stop-app.ps1 "$OUT_DIR/"
cp portable/windows/setup.bat "$OUT_DIR/"
cp portable/windows/install-service.ps1 "$OUT_DIR/"
cp portable/windows/uninstall-service.ps1 "$OUT_DIR/"
cp portable/windows/install-service.bat "$OUT_DIR/"
cp portable/windows/uninstall-service.bat "$OUT_DIR/"
cp portable/windows/config/.env.example "$OUT_DIR/config/"
cp portable/windows/app/run.cmd "$OUT_DIR/app/"
cp portable/windows/updater/*.ps1 "$OUT_DIR/updater/"

# cmd.exe on Windows only parses .bat/.cmd correctly with CRLF. Packing from macOS/Linux
# (or a Git checkout with LF) ships LF-only scripts that fail with:
#   'tlocal' is not recognized as an internal or external command
# Rewrite every Windows launcher text file to CRLF regardless of source line endings.
#
# Windows PowerShell 5.1 (default on Server) reads scripts as the system ANSI code page
# unless a UTF-8 BOM is present. Em-dashes/arrows in UTF-8 without BOM become garbage and
# can break parsing mid-string (ParserError: UnexpectedToken). Write .ps1 as UTF-8 BOM + CRLF.
to_crlf() {
  local f="$1"
  python3 - "$f" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
data = path.read_bytes()
# Strip any existing BOM, then normalize newlines.
if data.startswith(b"\xef\xbb\xbf"):
    data = data[3:]
text = data.decode("utf-8", errors="surrogateescape")
text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n")
payload = text.encode("utf-8", errors="surrogateescape")
# UTF-8 BOM for .ps1 so Windows PowerShell 5.1 parses as UTF-8.
if path.suffix.lower() == ".ps1":
    payload = b"\xef\xbb\xbf" + payload
path.write_bytes(payload)
PY
}
echo "==> Force CRLF on Windows scripts (cmd.exe requires it; .ps1 also get UTF-8 BOM)"
while IFS= read -r -d '' f; do
  to_crlf "$f"
  echo "  CRLF: ${f#"$OUT_DIR/"}"
done < <(find "$OUT_DIR" -type f \( -name '*.bat' -o -name '*.cmd' -o -name '*.ps1' \) -print0)

# --- 8. VERSION + manifest + feed example + README ---
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
  "runner": "vbeyond-api.exe",
  "bunVersion": "${BUN_VERSION}",
  "prismaEnginesVersion": "${ENGINES_VERSION}",
  "target": "windows-x64"
}
EOF

cat > "$OUT_DIR/config/feed.example.json" <<EOF
{
  "channel": "stable",
  "latest": "${VERSION}",
  "releases": [
    {
      "version": "${VERSION}",
      "publishedAt": "${BUILT_AT}",
      "notes": "Portable Windows package",
      "assetUrl": "https://github.com/Marwin5411-Winner/Car-Stock-monorepo/releases/download/v${VERSION}/vbeyond-windows-v${VERSION}.zip",
      "sha256": "REPLACE_AFTER_ZIP",
      "minVersion": "1.0.0"
    }
  ]
}
EOF

cat > "$OUT_DIR/README.txt" <<EOF
VBeyond portable Windows package v${VERSION}
Built: ${BUILT_AT}
Git: ${GIT_SHA}

REQUIREMENTS
  - Windows 10/11 or Windows Server (x64)
  - PostgreSQL 14+ installed and running (service Automatic)
  - Chrome or Edge recommended for PDF

INSTALL
  1. Extract this folder (e.g. C:\\VBeyond)
  2. copy config\\.env.example config\\.env
  3. Edit DATABASE_URL, JWT_SECRET, CORS_ORIGIN, PORT
  4. Run setup.bat          (database migrate)
  5. Run start.bat          (or install-service.ps1 as Admin for auto-start)

DEFAULT URL
  http://localhost:3001

AUTO-START
  Right-click install-service.bat -> Run as administrator
  (or PowerShell as Admin:  .\\install-service.ps1)
  NSSM is included at tools\\nssm.exe — no download needed.
  The service is set to depend on the local PostgreSQL service when one is found.

UPDATE
  Set UPDATE_FEED_URL in config\\.env
  Settings UI (Admin) or:  updater\\update.ps1 -Action Update

Docs: docs/portable-windows-install.md in the source repository.
EOF

# --- 9. Integrity check ---
echo "==> Verify package contents"
need=(
  "app/vbeyond-api.exe"
  "app/bun.exe"
  "app/engines/query_engine-windows.dll.node"
  "app/engines/schema-engine-windows.exe"
  "app/public/index.html"
  "app/prisma/schema.prisma"
  # Without it setup.bat and the updater fall back to a bare `migrate deploy`, which is
  # exactly what fails on a drifted database.
  "app/scripts/auto-resolve-migrations.ts"
  "app/VERSION"
  "start.bat"
  "setup.bat"
  "stop.bat"
  "stop-app.ps1"
  "install-service.bat"
  "uninstall-service.bat"
  # The .bat files are only launchers; the .ps1 files do the work. Shipping a package with
  # the launcher but not the script gave customers a window that flashed and closed.
  "install-service.ps1"
  "uninstall-service.ps1"
  # Auto-start is unusable without it — see step 6b.
  "tools/nssm.exe"
  "updater/update.ps1"
  "config/.env.example"
)
missing=0
for rel in "${need[@]}"; do
  if [ ! -e "$OUT_DIR/$rel" ]; then
    echo "  MISSING: $rel"
    missing=1
  else
    echo "  OK: $rel"
  fi
done

# Assert Windows batch files are CRLF. LF-only .bat is unusable under cmd.exe
# ('tlocal' is not recognized… from setlocal). Caught v1.0.58 and earlier packages.
# Assert every shipped launcher, not a hand-listed four: install-service.bat and
# uninstall-service.bat were converted but never checked, so the net had a hole exactly
# where the service scripts are. node_modules is excluded — an npm shim's line endings
# are not ours to gate a release on.
while IFS= read -r -d '' bat; do
  rel="${bat#"$OUT_DIR/"}"
  if ! python3 -c "import pathlib,sys; d=pathlib.Path(sys.argv[1]).read_bytes(); sys.exit(0 if b'\\r\\n' in d else 1)" "$bat"; then
    echo "  FAIL: $rel is not CRLF — cmd.exe will misparse it"
    missing=1
  else
    echo "  OK: $rel is CRLF"
  fi
done < <(find "$OUT_DIR" -type f \( -name '*.bat' -o -name '*.cmd' \) -not -path '*/node_modules/*' -print0)

# Build-time asserts. These exist because v1.0.55-1.0.57 all shipped an exe that could not
# start: `bun build` inlined process.env.NODE_ENV as development, so the API constructed
# pino's worker-thread transport, which requires pino-roll from a node_modules that does not
# exist inside a compiled binary. It died before binding a port and start.bat just timed out.
for artifact in "$OUT_DIR/app/vbeyond-api.exe" "$OUT_DIR/app/dist/index.js"; do
  # Bun currently emits `var isDev = true|false`; also match spacing / isDev=!0 / isDev=true.
  if grep -aEq 'isDev\s*=\s*(true|!0)' "$artifact"; then
    echo "  FAIL: $(basename "$artifact") built with NODE_ENV != production (isDev truthy)"
    missing=1
  fi
  # Positive check: production build must fold isDev to false (current Bun emit).
  if ! grep -aEq 'isDev\s*=\s*false' "$artifact"; then
    echo "  FAIL: $(basename "$artifact") missing isDev=false — NODE_ENV define may not have applied"
    missing=1
  fi
  # import.meta.dir resolves into Bun's read-only virtual FS (B:\~BUN\...) in the exe,
  # so the log directory must come from LOG_DIR / cwd instead.
  if ! grep -aqF 'process.env.LOG_DIR' "$artifact"; then
    echo "  FAIL: $(basename "$artifact") does not resolve LOG_DIR at runtime"
    missing=1
  fi
done

# PowerShell syntax gate. install-service.ps1, stop-app.ps1 and the updater only ever execute
# on the customer's server, so a parse error ships undetected — and the CI job runs on
# ubuntu-latest, where these files are never even loaded.
#
# Best-effort by design: packing must not require a PowerShell runtime. But when one IS
# reachable a broken script has to fail the pack, and when none is, say so loudly rather than
# printing nothing — a check that silently never runs reads as coverage it does not provide.
PS_IMAGE="mcr.microsoft.com/powershell:latest"
PS_PARSE_FILE="${CACHE_DIR}/parse-check.ps1"
cat > "$PS_PARSE_FILE" <<'PSEOF'
param([string]$Dir)
$bad = 0
Get-ChildItem -LiteralPath $Dir -Recurse -Filter *.ps1 |
    Where-Object { $_.FullName -notmatch 'node_modules' } |
    Sort-Object FullName |
    ForEach-Object {
        $tokens = $null
        $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile(
            $_.FullName, [ref]$tokens, [ref]$errors)
        if ($errors -and $errors.Count -gt 0) {
            $bad++
            Write-Host "  FAIL: $($_.Name) has a syntax error"
            $errors | ForEach-Object {
                Write-Host ("     line {0}: {1}" -f $_.Extent.StartLineNumber, $_.Message)
            }
        } else {
            Write-Host "  OK: $($_.Name) parses"
        }
    }
exit $bad
PSEOF

echo "==> PowerShell syntax check"
if command -v pwsh >/dev/null 2>&1; then
  pwsh -NoProfile -File "$PS_PARSE_FILE" "$OUT_DIR" || missing=1
elif docker image inspect "$PS_IMAGE" >/dev/null 2>&1; then
  # Only when the image is already local — a release should not stall on a 300MB pull.
  docker run --rm \
    -v "${OUT_DIR}:/pkg:ro" \
    -v "${PS_PARSE_FILE}:/parse.ps1:ro" \
    "$PS_IMAGE" pwsh -NoProfile -File /parse.ps1 /pkg || missing=1
else
  echo "  SKIPPED — no PowerShell parser available, .ps1 syntax was NOT verified."
  echo "    enable with:  brew install --cask powershell"
  echo "    or:           docker pull ${PS_IMAGE}"
fi

if [ "$missing" -ne 0 ]; then
  echo "ERROR: package incomplete"
  exit 1
fi

# --- 10. Zip + sha256 ---
if [ "$DO_ZIP" = true ]; then
  echo "==> Zip"
  (
    cd "${ROOT_DIR}/dist"
    rm -f "${OUT_NAME}.zip"
    if command -v zip >/dev/null 2>&1; then
      zip -rq "${OUT_NAME}.zip" "${OUT_NAME}"
    else
      echo "zip CLI missing; try: tar -a -cf ${OUT_NAME}.zip ${OUT_NAME}"
      tar -a -cf "${OUT_NAME}.zip" "${OUT_NAME}" 2>/dev/null || true
    fi
    if [ -f "${OUT_NAME}.zip" ]; then
      if command -v shasum >/dev/null 2>&1; then
        SHA="$(shasum -a 256 "${OUT_NAME}.zip" | awk '{print $1}')"
      else
        SHA="$(sha256sum "${OUT_NAME}.zip" | awk '{print $1}')"
      fi
      echo "$SHA  ${OUT_NAME}.zip" > "${OUT_NAME}.zip.sha256"
      # write feed.json next to zip for release upload
      cat > "feed-${VERSION}.json" <<FEED
{
  "channel": "stable",
  "latest": "${VERSION}",
  "releases": [
    {
      "version": "${VERSION}",
      "publishedAt": "${BUILT_AT}",
      "notes": "Portable Windows package v${VERSION}",
      "assetUrl": "https://github.com/Marwin5411-Winner/Car-Stock-monorepo/releases/download/v${VERSION}/vbeyond-windows-v${VERSION}.zip",
      "sha256": "${SHA}",
      "minVersion": "1.0.0"
    }
  ]
}
FEED
      # Constant name too: customers point UPDATE_FEED_URL at
      # .../releases/latest/download/feed.json, which only resolves if the asset is
      # literally called feed.json. The versioned copy is kept for release archaeology.
      cp "feed-${VERSION}.json" feed.json
      echo "Created dist/${OUT_NAME}.zip"
      echo "SHA256: ${SHA}"
      echo "Feed:   dist/feed.json (copy of feed-${VERSION}.json)"
    fi
  )
fi

echo ""
echo "Done: ${OUT_DIR}"
echo "Ship the zip to the customer Windows server — no Docker/Bun/Git required."
