# Install VBeyondCarStock as a Windows Service (auto-start on boot).
# Requires NSSM on PATH or at tools\nssm.exe (https://nssm.cc/)
#
# Usage (Admin PowerShell):
#   .\install-service.ps1
#   .\install-service.ps1 -NssmPath C:\Tools\nssm\win64\nssm.exe

param(
    [string]$NssmPath = '',
    [string]$ServiceName = 'VBeyondCarStock',
    [string]$DisplayName = 'VBeyond Car Stock'
)

$ErrorActionPreference = 'Stop'
$VbHome = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $VbHome) { $VbHome = $PSScriptRoot }

$startBat = Join-Path $VbHome 'start.bat'
if (-not (Test-Path -LiteralPath $startBat)) {
    throw "start.bat not found at $startBat"
}
if (-not (Test-Path -LiteralPath (Join-Path $VbHome 'config\.env'))) {
    throw 'config\.env missing. Copy config\.env.example and configure first.'
}

function Find-Nssm {
    param([string]$Hint)
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

$nssm = Find-Nssm -Hint $NssmPath
if (-not $nssm) {
    throw @'
NSSM not found. Download from https://nssm.cc/ and either:
  - Place nssm.exe in tools\ under the install root, or
  - Pass -NssmPath path\to\nssm.exe
'@
}

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
& $nssm set $ServiceName AppDirectory $VbHome
& $nssm set $ServiceName DisplayName $DisplayName
& $nssm set $ServiceName Description 'VBeyond car dealership management (portable package)'
& $nssm set $ServiceName Start SERVICE_AUTO_START
& $nssm set $ServiceName AppStdout (Join-Path $VbHome 'data\logs\app\service-stdout.log')
& $nssm set $ServiceName AppStderr (Join-Path $VbHome 'data\logs\app\service-stderr.log')
& $nssm set $ServiceName AppRotateFiles 1
& $nssm set $ServiceName AppExit Default Restart
& $nssm set $ServiceName AppRestartDelay 5000

# Ensure log dir exists
New-Item -ItemType Directory -Force -Path (Join-Path $VbHome 'data\logs\app') | Out-Null

Start-Service -Name $ServiceName
Write-Host "Service $ServiceName installed and started (Automatic)."
Write-Host "Ensure PostgreSQL Windows service is also Automatic so DB is up before app."
Write-Host "UI: http://localhost:PORT (see config\.env PORT)"
