# Install VBeyondCarStock as a Windows Service (auto-start on boot).
# Requires NSSM on PATH or at tools\nssm.exe (https://nssm.cc/)
#
# Usage (Admin PowerShell — or double-click install-service.bat as Admin):
#   .\install-service.ps1
#   .\install-service.ps1 -NssmPath C:\Tools\nssm\win64\nssm.exe

param(
    [string]$NssmPath = '',
    [string]$ServiceName = 'VBeyondCarStock',
    [string]$DisplayName = 'VBeyond Car Stock'
)

$ErrorActionPreference = 'Stop'
$exitCode = 0

function Test-IsAdministrator {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($id)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    } catch {
        return $false
    }
}

function Find-Nssm {
    param([string]$Hint, [string]$VbHome)
    if ($Hint -and (Test-Path -LiteralPath $Hint)) { return (Resolve-Path $Hint).Path }
    $candidates = @(
        (Join-Path $VbHome 'tools\nssm.exe'),
        (Join-Path $VbHome 'app\tools\nssm.exe')
    )
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c) { return (Resolve-Path $c).Path }
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Pause-IfInteractive {
    if (-not [Environment]::UserInteractive) { return }
    # Skip pause when stdin is redirected (CI / non-console hosts).
    try {
        if ([Console]::IsInputRedirected) { return }
    } catch { }
    Write-Host ''
    Read-Host 'Press Enter to close' | Out-Null
}

try {
    $VbHome = Split-Path -Parent $MyInvocation.MyCommand.Path
    if (-not $VbHome) { $VbHome = $PSScriptRoot }
    if (-not $VbHome) { throw 'Could not resolve install root (script directory).' }
    $VbHome = (Resolve-Path -LiteralPath $VbHome).Path

    Write-Host "VBeyond service install"
    Write-Host "  Root: $VbHome"
    Write-Host ''

    if (-not (Test-IsAdministrator)) {
        throw @'
This script must run as Administrator.

  - Right-click PowerShell → Run as administrator, then:
      cd <install root>
      .\install-service.ps1
  - Or right-click install-service.bat → Run as administrator
'@
    }

    $startBat = Join-Path $VbHome 'start.bat'
    if (-not (Test-Path -LiteralPath $startBat)) {
        throw "start.bat not found at $startBat"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $VbHome 'config\.env'))) {
        throw 'config\.env missing. Copy config\.env.example and configure DATABASE_URL / JWT_SECRET first.'
    }

    $nssm = Find-Nssm -Hint $NssmPath -VbHome $VbHome
    if (-not $nssm) {
        $toolsDir = Join-Path $VbHome 'tools'
        throw @"
NSSM not found. The portable package does not include nssm.exe.

1. Download NSSM (win64) from https://nssm.cc/download
2. Place nssm.exe here:
     $toolsDir\nssm.exe
3. Re-run this script as Administrator:
     .\install-service.ps1

Or pass -NssmPath path\to\nssm.exe
"@
    }
    Write-Host "  NSSM: $nssm"

    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Service $ServiceName already exists. Removing..."
        & $nssm stop $ServiceName confirm 2>$null
        & $nssm remove $ServiceName confirm
        Start-Sleep -Seconds 2
    }

    $cmdExe = "$env:SystemRoot\System32\cmd.exe"
    $args = "/c `"$startBat`" /service"

    Write-Host "Installing $ServiceName via NSSM..."
    & $nssm install $ServiceName $cmdExe $args
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        throw "nssm install failed with exit code $LASTEXITCODE"
    }

    & $nssm set $ServiceName AppDirectory $VbHome | Out-Null
    & $nssm set $ServiceName DisplayName $DisplayName | Out-Null
    & $nssm set $ServiceName Description 'VBeyond car dealership management (portable package)' | Out-Null
    & $nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
    & $nssm set $ServiceName AppStdout (Join-Path $VbHome 'data\logs\app\service-stdout.log') | Out-Null
    & $nssm set $ServiceName AppStderr (Join-Path $VbHome 'data\logs\app\service-stderr.log') | Out-Null
    & $nssm set $ServiceName AppRotateFiles 1 | Out-Null
    & $nssm set $ServiceName AppExit Default Restart | Out-Null
    & $nssm set $ServiceName AppRestartDelay 5000 | Out-Null

    New-Item -ItemType Directory -Force -Path (Join-Path $VbHome 'data\logs\app') | Out-Null

    Write-Host "Starting service..."
    Start-Service -Name $ServiceName
    Start-Sleep -Seconds 2

    $svc = Get-Service -Name $ServiceName
    Write-Host ''
    Write-Host "Service $ServiceName installed."
    Write-Host "  Status:  $($svc.Status)"
    Write-Host "  Start:   Automatic"
    Write-Host "  Logs:    $(Join-Path $VbHome 'data\logs\app\service-stdout.log')"
    Write-Host "           $(Join-Path $VbHome 'data\logs\app\service-stderr.log')"
    Write-Host "  Ensure PostgreSQL Windows service is also Automatic."
    Write-Host "  UI: http://localhost:PORT (see config\.env PORT)"

    if ($svc.Status -ne 'Running') {
        Write-Host ''
        Write-Host "WARN: service is not Running. Check service-stderr.log and config\.env." -ForegroundColor Yellow
        $exitCode = 2
    }
} catch {
    $exitCode = 1
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ''
    Write-Host 'If the service was half-installed, run uninstall-service.ps1 (as Admin) and try again.'
} finally {
    Pause-IfInteractive
    exit $exitCode
}
