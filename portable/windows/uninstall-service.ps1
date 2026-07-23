# Remove VBeyondCarStock Windows Service
#
# Usage (Admin PowerShell — or double-click uninstall-service.bat as Admin):
#   .\uninstall-service.ps1

param(
    [string]$NssmPath = '',
    [string]$ServiceName = 'VBeyondCarStock'
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
    foreach ($c in @((Join-Path $VbHome 'tools\nssm.exe'), (Join-Path $VbHome 'app\tools\nssm.exe'))) {
        if (Test-Path -LiteralPath $c) { return (Resolve-Path $c).Path }
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

function Pause-IfInteractive {
    if (-not [Environment]::UserInteractive) { return }
    try {
        if ([Console]::IsInputRedirected) { return }
    } catch { }
    Write-Host ''
    Read-Host 'Press Enter to close' | Out-Null
}

try {
    $VbHome = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
    if (-not $VbHome) { throw 'Could not resolve install root.' }
    $VbHome = (Resolve-Path -LiteralPath $VbHome).Path

    if (-not (Test-IsAdministrator)) {
        throw @'
This script must run as Administrator.

  Right-click PowerShell → Run as administrator, then:
    cd <install root>
    .\uninstall-service.ps1
'@
    }

    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Host "Service $ServiceName not found."
    } else {
        $nssm = Find-Nssm -Hint $NssmPath -VbHome $VbHome
        if ($nssm) {
            Write-Host "Stopping and removing $ServiceName via NSSM..."
            & $nssm stop $ServiceName confirm 2>$null
            & $nssm remove $ServiceName confirm
        } else {
            Write-Host "NSSM not found; removing via Stop-Service + sc delete..."
            Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
            sc.exe delete $ServiceName | Out-Null
        }
        Write-Host "Service $ServiceName removed."
    }
} catch {
    $exitCode = 1
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    Pause-IfInteractive
    exit $exitCode
}
