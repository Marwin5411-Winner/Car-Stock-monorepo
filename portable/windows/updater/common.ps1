# Shared helpers for VBeyond portable Windows updater
# Dot-source from update.ps1: . "$PSScriptRoot\common.ps1"

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Windows Server 2016/2019 still negotiate TLS 1.0 by default, which GitHub refuses
# ("Could not create SSL/TLS secure channel") — every feed check and download would fail.
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch { }

function Get-VbHome {
    if ($env:VB_HOME -and (Test-Path -LiteralPath $env:VB_HOME)) {
        return (Resolve-Path -LiteralPath $env:VB_HOME).Path
    }
    # updater\ lives under VB_HOME
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
}

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        Set-Item -Path "Env:$key" -Value $val
    }
}

function Initialize-VbPaths {
    $script:VbHome = Get-VbHome
    $env:VB_HOME = $script:VbHome
    Import-DotEnv -Path (Join-Path $script:VbHome 'config\.env')

    $tokenFile = Join-Path $script:VbHome 'secrets\github_token.txt'
    if (Test-Path -LiteralPath $tokenFile) {
        $env:GITHUB_TOKEN = (Get-Content -LiteralPath $tokenFile -Raw).Trim()
    }

    $script:AppDir = Join-Path $script:VbHome 'app'
    $script:ReleasesDir = Join-Path $script:VbHome 'releases'
    $script:StagingDir = Join-Path $script:VbHome 'staging'
    $script:DataDir = Join-Path $script:VbHome 'data'
    $script:BackupsDir = Join-Path $script:DataDir 'backups'
    $script:StatusDir = Join-Path $script:DataDir 'status'
    $script:LogDir = Join-Path $script:DataDir 'logs\updater'
    $script:CacheDir = Join-Path $script:DataDir 'cache'
    $script:StatusFile = Join-Path $script:StatusDir 'update-status.json'
    $script:UpdateLock = Join-Path $script:StatusDir 'update.lock'
    $script:LastCheckFile = Join-Path $script:CacheDir 'last-check.json'

    @(
        $script:ReleasesDir, $script:StagingDir, $script:BackupsDir,
        $script:StatusDir, $script:LogDir, $script:CacheDir
    ) | ForEach-Object {
        if (-not (Test-Path -LiteralPath $_)) {
            New-Item -ItemType Directory -Path $_ -Force | Out-Null
        }
    }
}

function Get-LocalVersion {
    $vf = Join-Path $script:AppDir 'VERSION'
    if (Test-Path -LiteralPath $vf) {
        return (Get-Content -LiteralPath $vf -Raw).Trim()
    }
    return '0.0.0'
}

function Compare-SemVer {
    param([string]$A, [string]$B)
    $pa = $A.TrimStart('v').Split('.') | ForEach-Object { [int]($_ -replace '\D', '') }
    $pb = $B.TrimStart('v').Split('.') | ForEach-Object { [int]($_ -replace '\D', '') }
    while ($pa.Count -lt 3) { $pa += 0 }
    while ($pb.Count -lt 3) { $pb += 0 }
    for ($i = 0; $i -lt 3; $i++) {
        if ($pa[$i] -gt $pb[$i]) { return 1 }
        if ($pa[$i] -lt $pb[$i]) { return -1 }
    }
    return 0
}

function Write-UpdateStatus {
    param(
        [int]$Step,
        [int]$TotalSteps = 10,
        [string]$StepName,
        [string]$Status,
        [string]$Message,
        [string]$CurrentVersion = $null,
        [string]$TargetVersion = $null,
        [string]$BackupFile = $null,
        [string]$PreviousAppDir = $null,
        [string]$ErrorText = $null,
        [string[]]$ExtraLog = @()
    )

    $now = (Get-Date).ToString('o')
    $existing = $null
    if (Test-Path -LiteralPath $script:StatusFile) {
        try { $existing = Get-Content -LiteralPath $script:StatusFile -Raw | ConvertFrom-Json } catch { $existing = $null }
    }

    $logs = @()
    if ($existing -and $existing.logs) { $logs = @($existing.logs) }
    foreach ($line in $ExtraLog) {
        if ($line) { $logs += $line }
    }
    if ($logs.Count -gt 50) { $logs = $logs[-50..-1] }

    $startedAt = if ($existing -and $existing.startedAt) { $existing.startedAt } else { $now }

    $obj = [ordered]@{
        step           = $Step
        totalSteps     = $TotalSteps
        stepName       = $StepName
        status         = $Status
        message        = $Message
        currentVersion = $(if ($CurrentVersion) { $CurrentVersion } elseif ($existing) { $existing.currentVersion } else { $null })
        targetVersion  = $(if ($TargetVersion) { $TargetVersion } elseif ($existing) { $existing.targetVersion } else { $null })
        startedAt      = $startedAt
        updatedAt      = $now
        backupFile     = $(if ($BackupFile) { $BackupFile } elseif ($existing) { $existing.backupFile } else { $null })
        previousAppDir = $(if ($PreviousAppDir) { $PreviousAppDir } elseif ($existing) { $existing.previousAppDir } else { $null })
        logs           = $logs
        error          = $ErrorText
    }

    $tmp = "$script:StatusFile.tmp"
    ($obj | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $tmp -Encoding UTF8
    Move-Item -LiteralPath $tmp -Destination $script:StatusFile -Force
}

function Write-UpdaterLog {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "$ts [$Level] $Message"
    if (-not $script:UpdateLogFile) {
        $script:UpdateLogFile = Join-Path $script:LogDir ("update_{0:yyyyMMdd_HHmmss}.log" -f (Get-Date))
    }
    Add-Content -LiteralPath $script:UpdateLogFile -Value $line -Encoding UTF8
    Write-Host $line
    return $line
}

function Acquire-UpdateLock {
    if (Test-Path -LiteralPath $script:UpdateLock) {
        $age = (Get-Date) - (Get-Item -LiteralPath $script:UpdateLock).LastWriteTime
        if ($age.TotalHours -lt 2) {
            throw [System.InvalidOperationException]::new('Update already running')
        }
        Write-UpdaterLog 'Stale update.lock stolen after 2h' 'WARN' | Out-Null
    }
    Set-Content -LiteralPath $script:UpdateLock -Value (Get-Date).ToString('o') -Encoding UTF8
}

function Release-UpdateLock {
    if (Test-Path -LiteralPath $script:UpdateLock) {
        Remove-Item -LiteralPath $script:UpdateLock -Force -ErrorAction SilentlyContinue
    }
}

function Test-VbAppProcess {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return $false }
    return [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Get-VbProcessExePath {
    param([int]$ProcessId)
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($proc) {
        try {
            if ($proc.Path) { return $proc.Path }
        } catch { }
    }
    # Get-Process.Path is often empty (other session / limited rights). CIM usually works.
    try {
        $cim = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
        if ($cim -and $cim.ExecutablePath) { return $cim.ExecutablePath }
    } catch { }
    return $null
}

function Test-VbPathUnderApp {
    param([string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    $root = [IO.Path]::GetFullPath($script:AppDir)
    if (-not $root.EndsWith([IO.Path]::DirectorySeparatorChar)) {
        $root = $root + [IO.Path]::DirectorySeparatorChar
    }
    try {
        $full = [IO.Path]::GetFullPath($Path)
    } catch {
        return $false
    }
    return $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)
}

function Stop-VbAppProcessTree {
    param(
        [Parameter(Mandatory = $true)][int]$ProcessId,
        [string]$Reason = 'force-kill'
    )
    if ($ProcessId -le 0) { return }

    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) { return }

    $path = Get-VbProcessExePath -ProcessId $ProcessId
    if ($path) {
        if (-not (Test-VbPathUnderApp -Path $path)) {
            Write-UpdaterLog "Refusing to $Reason PID $ProcessId outside app\: $path" 'WARN' | Out-Null
            return
        }
    } else {
        # Still allow kill when CIM cannot resolve path but the process name matches our runners
        # and we already trusted this PID from app.pid (updater only force-kills recorded PIDs).
        $name = $proc.ProcessName
        if ($name -notin @('vbeyond-api', 'bun')) {
            Write-UpdaterLog "PID $ProcessId has no path and unexpected name '$name'; skipping $Reason" 'WARN' | Out-Null
            return
        }
        Write-UpdaterLog "PID $ProcessId path empty; force-killing by name=$name ($Reason)" 'WARN' | Out-Null
    }

    Write-UpdaterLog "Force-killing PID $ProcessId ($Reason)$(if ($path) { " path=$path" })" 'WARN' | Out-Null
    Start-Process -FilePath 'taskkill.exe' `
        -ArgumentList @('/PID', "$ProcessId", '/T', '/F') `
        -Wait -NoNewWindow -WindowStyle Hidden | Out-Null
}

function Stop-VbAppProcessesUnderAppDir {
    param([string]$Reason = 'app-dir-scan')
    $root = [IO.Path]::GetFullPath($script:AppDir)
    if (-not $root.EndsWith([IO.Path]::DirectorySeparatorChar)) {
        $root = $root + [IO.Path]::DirectorySeparatorChar
    }
    $procs = @(Get-CimInstance -ClassName Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -and (Test-VbPathUnderApp -Path $_.ExecutablePath) })
    foreach ($p in $procs) {
        $id = [int]$p.ProcessId
        Write-UpdaterLog "Force-killing PID $id ($Reason) path=$($p.ExecutablePath)" 'WARN' | Out-Null
        Start-Process -FilePath 'taskkill.exe' `
            -ArgumentList @('/PID', "$id", '/T', '/F') `
            -Wait -NoNewWindow -WindowStyle Hidden | Out-Null
    }
}

function Stop-VbApp {
    param([int]$TimeoutSec = 30)

    # Read the pid before stopping — stop.bat deletes the file on its way out.
    $appPid = 0
    $pidFile = Join-Path $script:StatusDir 'app.pid'
    if (Test-Path -LiteralPath $pidFile) {
        # -Raw returns $null for an empty file, and StrictMode makes .Trim() on $null fatal.
        $pidText = Get-Content -LiteralPath $pidFile -Raw -ErrorAction SilentlyContinue
        if ($pidText) {
            [void][int]::TryParse($pidText.Trim(), [ref]$appPid)
        }
    }

    $stopBat = Join-Path $script:VbHome 'stop.bat'
    if (Test-Path -LiteralPath $stopBat) {
        & cmd.exe /c "`"$stopBat`""
    } else {
        Get-Service -Name 'VBeyondCarStock' -ErrorAction SilentlyContinue | Stop-Service -Force -ErrorAction SilentlyContinue
    }

    # stop.bat / stop-app.ps1 return after taskkill is issued. The Swap step that follows
    # moves app\, which fails with "file in use" while the exe is still shutting down.
    # Wait on the recorded PID, then force-kill + scan anything still under app\.
    if ($appPid -gt 0) {
        $deadline = (Get-Date).AddSeconds($TimeoutSec)
        while ((Get-Date) -lt $deadline) {
            if (-not (Test-VbAppProcess -ProcessId $appPid)) { break }
            Start-Sleep -Milliseconds 500
        }

        if (Test-VbAppProcess -ProcessId $appPid) {
            Stop-VbAppProcessTree -ProcessId $appPid -Reason "still running after ${TimeoutSec}s stop wait"
            Start-Sleep -Milliseconds 750
        }
    }

    Stop-VbAppProcessesUnderAppDir -Reason 'pre-swap app-dir scan'
    Start-Sleep -Milliseconds 400

    if ($appPid -gt 0 -and (Test-VbAppProcess -ProcessId $appPid)) {
        throw "App PID $appPid still running after force-kill; cannot safely swap app\"
    }
}

function Start-VbApp {
    $svc = Get-Service -Name 'VBeyondCarStock' -ErrorAction SilentlyContinue
    if ($svc) {
        Start-Service -Name 'VBeyondCarStock'
        return
    }
    $startBat = Join-Path $script:VbHome 'start.bat'
    if (Test-Path -LiteralPath $startBat) {
        Start-Process -FilePath $startBat -WorkingDirectory $script:VbHome -WindowStyle Hidden
    }
}

function Wait-VbHealth {
    param([int]$TimeoutSec = 60)
    $port = if ($env:PORT) { $env:PORT } else { '3001' }
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 3
            # NOT -match 'healthy': that also matches "unhealthy", so an app that came up
            # without a database counted as a successful update and never rolled back.
            if ($r.StatusCode -eq 200 -and $r.Content -match '"status"\s*:\s*"healthy"') {
                return $true
            }
        } catch { }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Invoke-PgDumpBackup {
    param([string]$Suffix = 'pre-update')
    $ts = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $out = Join-Path $script:BackupsDir "car_stock_${ts}_${Suffix}.dump"

    $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    $toolDump = Join-Path $script:AppDir 'tools\pg_dump.exe'
    $exe = if ($pgDump) { $pgDump.Source } elseif (Test-Path $toolDump) { $toolDump } else { $null }
    if (-not $exe) {
        throw 'pg_dump not found. Install PostgreSQL client tools or place pg_dump.exe in app\tools\'
    }

    $env:PGPASSWORD = $null
    # Prefer DATABASE_URL
    if (-not $env:DATABASE_URL) {
        throw 'DATABASE_URL not set'
    }

    & $exe --dbname="$($env:DATABASE_URL)" -Fc -f $out
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit $LASTEXITCODE"
    }
    return $out
}

function Invoke-PgRestoreBackup {
    param([Parameter(Mandatory = $true)][string]$DumpPath)
    if (-not (Test-Path -LiteralPath $DumpPath)) {
        throw "Backup file not found: $DumpPath"
    }
    if (-not $env:DATABASE_URL) {
        throw 'DATABASE_URL not set'
    }

    $pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
    $toolRestore = Join-Path $script:AppDir 'tools\pg_restore.exe'
    $exe = if ($pgRestore) { $pgRestore.Source } elseif (Test-Path $toolRestore) { $toolRestore } else { $null }
    if (-not $exe) {
        throw 'pg_restore not found. Install PostgreSQL client tools or place pg_restore.exe in app\tools\'
    }

    Write-UpdaterLog "Restoring database from $DumpPath" 'WARN' | Out-Null
    & $exe --dbname="$($env:DATABASE_URL)" --clean --if-exists $DumpPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore failed with exit $LASTEXITCODE"
    }
    return $true
}

function Assert-SafeReleaseVersion {
    param([Parameter(Mandatory = $true)][string]$Version)
    # Single path segment only — no traversal, separators, or drive letters
    if ($Version -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
        throw "Invalid release version: $Version"
    }
    if ($Version.Contains('..') -or $Version.Contains('\') -or $Version.Contains('/')) {
        throw "Invalid release version: $Version"
    }
}

function Resolve-ReleaseDir {
    param([Parameter(Mandatory = $true)][string]$Version)
    Assert-SafeReleaseVersion -Version $Version
    $candidate = Join-Path $script:ReleasesDir $Version
    if (-not (Test-Path -LiteralPath $candidate)) {
        throw "Release folder not found: $candidate"
    }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    $releasesRoot = (Resolve-Path -LiteralPath $script:ReleasesDir).Path
    $rootWithSep = if ($releasesRoot.EndsWith('\')) { $releasesRoot } else { $releasesRoot + '\' }
    if (-not ($resolved.Equals($releasesRoot, [StringComparison]::OrdinalIgnoreCase) -or
            $resolved.StartsWith($rootWithSep, [StringComparison]::OrdinalIgnoreCase))) {
        throw "Release path escapes releases\: $resolved"
    }
    return $resolved
}

function Restore-AppTree {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [string]$BackupFile = ''
    )
    # DB first when a dump exists — migrate may have already altered schema
    if ($BackupFile) {
        if (Test-Path -LiteralPath $BackupFile) {
            Invoke-PgRestoreBackup -DumpPath $BackupFile
        } else {
            Write-UpdaterLog "Backup file missing, cannot restore DB: $BackupFile" 'ERROR' | Out-Null
            throw "DB rollback required but backup missing: $BackupFile"
        }
    } else {
        Write-UpdaterLog 'No pre-update backup; database was NOT rolled back' 'WARN' | Out-Null
    }

    if (Test-Path -LiteralPath $script:AppDir) {
        Remove-Item -LiteralPath $script:AppDir -Recurse -Force
    }
    if (-not (Test-Path -LiteralPath $SourceDir)) {
        throw "Previous app directory missing: $SourceDir"
    }
    Copy-Item -LiteralPath $SourceDir -Destination $script:AppDir -Recurse -Force
}

function Invoke-MigrateDeploy {
    $env:PRISMA_QUERY_ENGINE_LIBRARY = Join-Path $script:AppDir 'engines\query_engine-windows.dll.node'
    $env:PRISMA_SCHEMA_ENGINE_BINARY = Join-Path $script:AppDir 'engines\schema-engine-windows.exe'
    $env:PRISMA_CLI_QUERY_ENGINE_TYPE = 'library'
    $schema = Join-Path $script:AppDir 'prisma\schema.prisma'
    $bun = Join-Path $script:AppDir 'bun.exe'
    $prismaJs = Join-Path $script:AppDir 'tools\migrate\node_modules\prisma\build\index.js'

    Push-Location $script:AppDir
    try {
        if ((Test-Path -LiteralPath $bun) -and (Test-Path -LiteralPath $prismaJs)) {
            & $bun $prismaJs migrate deploy --schema=$schema
        } elseif (Test-Path -LiteralPath $bun) {
            & $bun x prisma migrate deploy --schema=$schema
        } else {
            & bun x prisma migrate deploy --schema=$schema
        }
        if ($LASTEXITCODE -ne 0) {
            throw "migrate deploy failed with exit $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

function Get-UpdateFeed {
    $feedUrl = $env:UPDATE_FEED_URL
    if (-not $feedUrl) {
        throw 'UPDATE_FEED_URL is not set in config\.env'
    }
    $headers = @{ Accept = 'application/json' }
    if ($env:GITHUB_TOKEN) {
        $headers['Authorization'] = "Bearer $($env:GITHUB_TOKEN)"
    }
    return Invoke-RestMethod -Uri $feedUrl -Headers $headers -Method Get -UseBasicParsing
}
