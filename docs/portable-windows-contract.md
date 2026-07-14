# Portable Windows Package — Folder + Script Contracts

This document defines the **fixed paths, env vars, exit codes, status JSON, and script behavior** for a Docker-free Windows Server deployment of VBeyond Car Stock.

**Goals:**

- Customer installs **PostgreSQL** themselves
- You set **config once**
- **Click and run** (no Docker, no Bun/Node/Git required on the customer machine for day-to-day use)
- **Auto-update** via versioned release zips (not every git commit)
- Optional secrets (tokens/keys) stored with strict ACLs — not “hidden paths”

**Out of scope for this contract:** implementation code, CI pipeline details, and the existing Docker updater (see `docs/auto-updater-setup.md`). Portable mode is a parallel runtime with the same product ideas (check → backup → swap → migrate → health → rollback).

Default install root (documentation only): `C:\VBeyond\`. Scripts resolve `VB_HOME` from their own location and must not hardcode this path.

---

## 1. Folder layout (exact)

```
C:\VBeyond\                          # VB_HOME (install root)
│
├── start.bat                        # Double-click entry (thin wrapper)
├── stop.bat                         # Graceful stop
├── setup.bat                        # First-time: migrate + optional seed
├── install-service.ps1              # Optional: Windows Service
├── uninstall-service.ps1
│
├── config\                          # NEVER overwritten by updates
│   ├── .env                         # Live secrets (create from .env.example)
│   ├── .env.example                 # Template shipped in every package
│   └── instance.json                # Optional: site id, channel
│
├── app\                             # CURRENT running release (atomic swap target)
│   ├── VERSION                      # e.g. 1.0.56  (plain text, one line)
│   ├── package-manifest.json        # Build metadata (see §5)
│   ├── vbeyond-api.exe              # Main process (Bun compile) OR
│   ├── run.cmd                      # Fallback if using portable bun + dist
│   ├── public\                      # Built React SPA (index.html, assets/)
│   ├── prisma\
│   │   ├── schema.prisma
│   │   └── migrations\
│   ├── engines\                     # Prisma engines for win32-x64
│   ├── templates\                   # Handlebars / PDF assets if needed
│   └── tools\
│       ├── prisma.exe               # Or wrapper that runs migrate deploy
│       └── pg_dump.exe              # Optional: ship only if not on PATH
│
├── releases\                        # Previous versions for rollback
│   ├── 1.0.55\                      # Full copy of former app\
│   └── 1.0.56\
│
├── staging\                         # Download + unpack zone (empty between updates)
│   └── (temp zip + extracted folder)
│
├── data\
│   ├── logs\
│   │   ├── app\                     # API stdout/stderr / pino rolls
│   │   └── updater\                 # update_YYYYMMDD_HHMMSS.log
│   ├── backups\
│   │   └── car_stock_2026-07-11_143022_pre-update.dump
│   ├── status\
│   │   ├── update-status.json       # Polled by Settings UI / API
│   │   ├── app.pid                  # Current process id
│   │   └── app.lock                 # Single-instance lock
│   └── cache\
│       └── last-check.json          # Last remote version check
│
├── secrets\                         # Strict NTFS ACL (SYSTEM + service user)
│   ├── github_token.txt             # Optional: private release download
│   └── deploy_key                   # Optional: only if git-pull mode (not default)
│
└── updater\
    ├── update.ps1                   # Full pipeline (source of truth)
    ├── check.ps1                    # Thin: check only, write last-check.json
    ├── rollback.ps1                 # Restore previous release + optional DB
    └── common.ps1                   # Shared path/env helpers
```

### Ownership rules

| Path | Updated by release? | Written at runtime? |
|------|---------------------|---------------------|
| `config\` | **Never** | Admin only |
| `app\` | **Yes** (whole tree replace) | Logs should go to `data\logs` |
| `releases\` | Yes (archival) | Updater only |
| `data\` | **Never** replace | App + updater |
| `secrets\` | **Never** | Admin only |
| `updater\` | Yes (can self-update scripts last) | — |
| `staging\` | Transient | Updater only |

---

## 2. Config contracts

### 2.1 `config\.env` (required keys)

```env
# --- Required ---
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/car_stock?schema=public
JWT_SECRET=min-32-char-random-string
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://SERVER_HOSTNAME_OR_IP:3001

# --- Portable runtime (Windows) ---
VB_HOME=C:\VBeyond
# If empty, scripts derive VB_HOME from their location

# --- Update channel ---
UPDATE_CHANNEL=stable
UPDATE_FEED_URL=https://github.com/YOUR_ORG/Car-Stock-monorepo/releases/latest/download/feed.json
# Or fixed pattern:
# UPDATE_ASSET_URL_TEMPLATE=https://github.com/YOUR_ORG/Car-Stock-monorepo/releases/download/v{version}/vbeyond-windows-v{version}.zip
UPDATE_SECRET=random-shared-secret-for-local-updater-api
AUTO_UPDATE=false
KEEP_RELEASES=3

# --- Optional PDF ---
CHROMIUM_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# --- Optional private releases ---
# GITHUB_TOKEN read from secrets\github_token.txt if file exists (preferred over .env)
```

### 2.2 `config\instance.json` (optional)

```json
{
  "siteId": "customer-vbeyond-bkk",
  "displayName": "VBeyond Customer Server",
  "channel": "stable",
  "installedAt": "2026-07-11T00:00:00Z"
}
```

### 2.3 Env loading order

1. Process environment  
2. `config\.env`  
3. Secrets files override tokens only (`secrets\github_token.txt` → `GITHUB_TOKEN`)

App and scripts must use the same `VB_HOME` and must never hardcode `C:\VBeyond` except as a documentation default.

---

## 3. `start.bat` contract

### Purpose

Bring the app to “accepting HTTP” with zero interactive prompts (after first setup).

### CLI

```
start.bat [ /service | /console | /check ]
```

| Flag | Meaning |
|------|---------|
| *(none)* / `/console` | Start in current window (dev/debug) |
| `/service` | Used by Windows Service wrapper only |
| `/check` | Validate config + DB, print health, exit (no long-run) |

### Steps (must be in this order)

1. `cd /d "%~dp0"` → set `VB_HOME`  
2. Fail if `config\.env` missing → print “copy config\.env.example → config\.env”  
3. Fail if `app\VERSION` or `app\vbeyond-api.exe` (or `app\run.cmd`) missing  
4. Acquire `data\status\app.lock` (fail with exit 2 if already running)  
5. Write `data\status\app.pid`  
6. Load env from `config\.env` into process  
7. Set working directory to `app\`  
8. Redirect logs to `data\logs\app\stdout.log` and `stderr.log` (or let pino write under `data\logs\app\`)  
9. Exec main binary:
   - Preferred: `app\vbeyond-api.exe`
   - Fallback: `app\run.cmd` → portable bun + dist  
10. On process exit → remove pid/lock  

### Success criteria

Within **60s**, `GET http://127.0.0.1:%PORT%/health` returns:

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "..."
}
```

(Matches existing API health endpoint at `/health`.)

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Started OK (console mode: process ended cleanly) |
| `1` | Config / missing files |
| `2` | Already running |
| `3` | Process crashed before healthy |
| `4` | Health check failed (DB down) |

### `stop.bat` (companion)

1. Read `data\status\app.pid`  
2. Signal graceful stop (`taskkill /PID` if needed)  
3. Wait up to 30s  
4. Clear pid + lock  
5. Exit `0` if stopped or not running  

### `setup.bat` (first install only)

1. Same env load as start  
2. `app\tools\prisma.exe migrate deploy` (or equivalent)  
3. Optional: `setup.bat /seed`  
4. Does **not** start server unless `/start`  

---

## 4. `update.ps1` contract

Path: `updater\update.ps1`  
Shared helpers: `updater\common.ps1`

### CLI

```powershell
# From VB_HOME or any cwd — scripts resolve VB_HOME via $PSScriptRoot\..

.\updater\update.ps1 -Action Check
.\updater\update.ps1 -Action Update
.\updater\update.ps1 -Action Update -Version 1.0.56      # pin version
.\updater\update.ps1 -Action Update -Force                # re-apply same version
.\updater\update.ps1 -Action Status                       # print update-status.json
.\updater\update.ps1 -Action Rollback -Version 1.0.55
.\updater\update.ps1 -Action Backup
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `-Action` | `Check\|Update\|Status\|Rollback\|Backup` | required | |
| `-Version` | string | latest from feed | Target version |
| `-Force` | switch | false | Ignore “already current” |
| `-SkipBackup` | switch | false | **Forbidden in production docs**; for CI only |
| `-DryRun` | switch | false | Check + download only, no swap |

### Concurrency

- Lock file: `data\status\update.lock`  
- If lock held and younger than 2h → exit `10`  
- If lock held and older than 2h → steal lock, log warning  
- App update and manual backup must take the same lock  

### Status file contract

**Path:** `data\status\update-status.json`  
**Written after every step** (atomic write: temp + rename).

Shape (compatible with what Settings already polls via API):

```json
{
  "step": 3,
  "totalSteps": 10,
  "stepName": "Downloading",
  "status": "running",
  "message": "Downloading vbeyond-windows-v1.0.56.zip",
  "currentVersion": "1.0.55",
  "targetVersion": "1.0.56",
  "startedAt": "2026-07-11T14:30:00+07:00",
  "updatedAt": "2026-07-11T14:30:12+07:00",
  "backupFile": "C:\\VBeyond\\data\\backups\\car_stock_2026-07-11_143000_pre-update.dump",
  "previousAppDir": "C:\\VBeyond\\releases\\1.0.55",
  "logs": [
    "2026-07-11 14:30:00 [INFO] Update started",
    "2026-07-11 14:30:05 [INFO] Backup complete"
  ],
  "error": null
}
```

| `status` | Meaning |
|----------|---------|
| `idle` | No update |
| `running` | In progress |
| `success` | Finished OK |
| `failed` | Failed; may have rolled back |
| `rolling_back` | Rollback in progress |

`logs` = last ~50 lines (same idea as the Docker updater).

### Pipeline steps (`-Action Update`)

| Step | `stepName` | Actions | On failure |
|------|------------|---------|------------|
| 1 | `Lock` | Acquire `update.lock` | abort |
| 2 | `Resolve` | Read local `app\VERSION`; fetch feed; decide target | abort |
| 3 | `Download` | Download zip → `staging\`; verify checksum | abort, clean staging |
| 4 | `Verify` | Unzip to `staging\app-new\`; require VERSION + manifest | abort |
| 5 | `BackupDB` | `pg_dump` → `data\backups\*_pre-update.dump` | abort |
| 6 | `StopApp` | Call stop logic (pid/service) | abort (retry stop) |
| 7 | `Swap` | Move `app` → `releases\{oldVer}`; move staging → `app` | **rollback files** |
| 8 | `Migrate` | Run migrate deploy against same `DATABASE_URL` | **rollback files + DB** |
| 9 | `StartApp` | `start.bat` / service start; wait health | **rollback files + DB** |
| 10 | `Finalize` | Prune old releases (`KEEP_RELEASES`); clear lock; status=success | — |

**Invariant:** `config\`, `data\`, and `secrets\` are never replaced by the zip.

### Zip package contract (what CI must produce)

File name: `vbeyond-windows-v{version}.zip`

```
vbeyond-windows-v1.0.56/
  VERSION
  package-manifest.json
  vbeyond-api.exe
  public/
  prisma/
  engines/
  templates/          # if needed
  tools/
  config/.env.example # template only
  updater/            # optional: updated scripts
    update.ps1
    check.ps1
    rollback.ps1
    common.ps1
```

Extract rules:

- Contents land in `app\` **except** `updater\` → merge into `VB_HOME\updater\`  
- `config\.env.example` may refresh the template; **never** touch `config\.env`  
- No `node_modules` required at runtime if the app is compiled  

### `package-manifest.json`

```json
{
  "name": "vbeyond-windows",
  "version": "1.0.56",
  "builtAt": "2026-07-11T10:00:00Z",
  "gitSha": "abc1234",
  "minPostgresVersion": "14",
  "sha256": "…of zip…",
  "files": {
    "vbeyond-api.exe": "sha256:…"
  }
}
```

Download verify: compare published `sha256` from feed vs local file.

### Release feed contract (`feed.json` or GitHub latest)

```json
{
  "channel": "stable",
  "latest": "1.0.56",
  "releases": [
    {
      "version": "1.0.56",
      "publishedAt": "2026-07-11T10:00:00Z",
      "notes": "Fix payment report",
      "assetUrl": "https://…/vbeyond-windows-v1.0.56.zip",
      "sha256": "hex…",
      "minVersion": "1.0.0"
    }
  ]
}
```

**Check algorithm:**

```
hasUpdate = semver(remote.latest) > semver(local VERSION)
```

Not git commit equality (portable mode ≠ Docker git pull).

### `-Action Check` output (stdout JSON + `data\cache\last-check.json`)

```json
{
  "hasUpdate": true,
  "currentVersion": "1.0.55",
  "latestVersion": "1.0.56",
  "notes": "Fix payment report",
  "assetUrl": "https://…",
  "checkedAt": "2026-07-11T14:00:00+07:00"
}
```

Exit `0` if check network OK; exit `1` if feed unreachable.

### `-Action Rollback`

1. Require `-Version` that exists under `releases\{version}\`  
2. Backup current DB as `*_pre-rollback.dump`  
3. Stop app  
4. Move current `app` → `releases\{broken}-failed-{timestamp}`  
5. Copy `releases\{version}` → `app`  
6. **Do not** auto-restore DB unless `-RestoreBackup path` is passed (schema may match old app)  
7. Start + health  
8. Document: restoring old code onto a newer schema can break — prefer a forward fix  

### Exit codes (`update.ps1`)

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generic failure |
| `2` | Config error |
| `10` | Update already running |
| `11` | Already on target version |
| `12` | Download/verify failed |
| `13` | DB backup failed |
| `14` | Migrate failed (after rollback attempt) |
| `15` | Health check failed after update |
| `20` | Rollback failed (manual intervention) |

### Logging

- File: `data\logs\updater\update_yyyyMMdd_HHmmss.log`  
- Every log line also appends to `update-status.json` `logs` array (trimmed)  
- Format: `yyyy-MM-dd HH:mm:ss [LEVEL] message`  

---

## 5. Integration with existing Settings UI

Today the API proxies to the Docker updater (`UPDATER_URL=http://updater:9000`). See `apps/api/src/modules/system/system.service.ts` and `docs/auto-updater-setup.md`.

Portable mode contract:

| Env | Value |
|-----|--------|
| `UPDATER_MODE` | `portable` \| `docker` (default `docker` for backward compat) |
| `UPDATER_URL` | unused in portable, or `http://127.0.0.1:9000` if a tiny local agent is kept |

### Option A (recommended for v1) — file / process based

`system.service.ts` shells out or reads files:

| API route | Portable implementation |
|-----------|-------------------------|
| `GET /system/version` | Read `app\VERSION` + manifest |
| `GET /system/check-update` | Run `update.ps1 -Action Check`, parse JSON |
| `POST /system/update` | Start `update.ps1 -Action Update` detached; return 202 |
| `GET /system/update-status` | Read `data\status\update-status.json` |
| `POST /system/rollback` | `update.ps1 -Action Rollback …` |
| `POST /system/backup` | `update.ps1 -Action Backup` |
| `GET /system/backups` | List `data\backups\` |

### Option B — local HTTP agent

Small always-on updater HTTP on localhost:9000 wrapping the same scripts (mirrors Docker). More work; same scripts underneath.

**Auth stays:** existing ADMIN role + optional `UPDATE_SECRET` for any local HTTP.

---

## 6. Process / service model

### Console (MVP)

```
start.bat          → runs vbeyond-api.exe in foreground
Task Scheduler     → optional: start at logon
```

### Windows Service (production)

```
install-service.ps1
  → registers "VBeyondCarStock"
  → binary: NSSM or WinSW wrapping start.bat /service
  → WorkingDirectory = VB_HOME
  → Restart on failure
```

Update pipeline stop/start:

```
Stop-Service VBeyondCarStock
# swap files
Start-Service VBeyondCarStock
```

If the service is not installed, fall back to pid file + `stop.bat` / `start.bat`.

---

## 7. First-run vs update (operator checklist)

### First install

```
1. Install PostgreSQL; create DB/user
2. Unzip package to C:\VBeyond\
3. copy config\.env.example config\.env  → edit DATABASE_URL, JWT_SECRET
4. setup.bat
5. start.bat
6. Browser → http://SERVER:3001
```

### Later update (admin UI or CLI)

```
updater\update.ps1 -Action Check
updater\update.ps1 -Action Update
# or Settings → Check for updates → Update
```

### Release side (vendor)

```
./scripts/release.sh patch
# CI: build Windows zip + feed + sha256
# Customer never needs git/ssh for the default release-zip channel
```

**Important:** do not auto-update production on every commit to `main`. Ship **versioned tags/releases** only.

---

## 8. Security contracts (scripts must enforce)

1. Refuse or warn if `config\.env` has overly open ACLs.  
2. Never log `DATABASE_URL` password, `JWT_SECRET`, or tokens.  
3. Download only over HTTPS; verify `sha256`.  
4. `secrets\` must not be included in offsite backup zips without encryption.  
5. Detached update process runs as the same user as the service (not a random interactive desktop session).  
6. Prefer release zip + optional read-only GitHub token over a long-lived SSH deploy key.  
7. If an SSH deploy key is used: read-only, single-repo, NTFS ACL for service account only — “hiding the path” is not security.  

---

## 9. Minimal file set to implement first

| File | Role |
|------|------|
| `start.bat` | Start + lock + health expectation |
| `stop.bat` | Stop + clear lock |
| `setup.bat` | migrate deploy |
| `updater\common.ps1` | Paths, load env, atomic status write, semver |
| `updater\update.ps1` | Check / Update / Backup / Status |
| `updater\rollback.ps1` | Thin wrapper or `-Action Rollback` only |
| `config\.env.example` | Documented keys |

Optional later: `install-service.ps1`, self-updating `updater\` scripts, private GitHub token.

---

## 10. Contract summary diagram

```
[You] tag v1.0.56 → CI → zip + feed.json + sha256
                              │
                              ▼
[Customer] update.ps1 -Action Update
   │
   ├─ read config\.env          (unchanged forever by updates)
   ├─ backup DB → data\backups\
   ├─ stop app (pid/service)
   ├─ app\ → releases\1.0.55\
   ├─ staging → app\
   ├─ migrate deploy
   ├─ start app
   └─ health GET /health = healthy
                              │
                              ▼
              data\status\update-status.json
                              │
                              ▼
              Settings UI polls GET /system/update-status
```

---

## 11. Open choices (pin before coding)

| Choice | Options | Recommended default |
|--------|---------|---------------------|
| Binary | pure `vbeyond-api.exe` vs portable Bun + `dist` | **`vbeyond-api.exe` + `bun.exe` + Prisma Windows engines** (built by `scripts/pack-windows.sh`) |
| Updater trigger | file-based (Option A) vs local :9000 agent (Option B) | **Option A** |
| Feed host | GitHub Releases vs own HTTPS static feed | **GitHub Releases** |
| Service wrapper | NSSM vs WinSW vs Task Scheduler only | **NSSM or Task Scheduler for v1** |

---

## 12. Related docs

| Doc | Topic |
|-----|--------|
| `SETUP-WINDOWS.md` | Current Docker-based Windows setup |
| `docs/auto-updater-setup.md` | Docker sidecar updater (git pull + rebuild) |
| `README.md` | Dev setup and Docker production |
| `scripts/release.sh` | Version bump + git tag |
| `VERSION` | Current package version |

---

## 13. Implementation phases (reference)

| Phase | Outcome |
|-------|---------|
| **1. Portable runtime** | API serves static web; Windows start scripts; external Postgres |
| **2. Package** | CI zip per version; folder layout + `.env` template |
| **3. Service** | Run as Windows Service (auto-start after reboot) |
| **4. Updater** | PowerShell pipeline + Settings UI (`UPDATER_MODE=portable`) |
| **5. Hardening** | ACLs, backup retention, rollback, healthchecks |

Phase 1–2 alone solve “set config and click run, no Docker.”  
Phase 4 is auto-update.  
SSH deploy keys remain optional and non-default.
