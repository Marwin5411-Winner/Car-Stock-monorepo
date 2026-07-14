# Remove VBeyondCarStock Windows Service
param(
    [string]$NssmPath = '',
    [string]$ServiceName = 'VBeyondCarStock'
)

$ErrorActionPreference = 'Stop'
$VbHome = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }

function Find-Nssm {
    param([string]$Hint)
    if ($Hint -and (Test-Path -LiteralPath $Hint)) { return (Resolve-Path $Hint).Path }
    foreach ($c in @((Join-Path $VbHome 'tools\nssm.exe'), (Join-Path $VbHome 'app\tools\nssm.exe'))) {
        if (Test-Path -LiteralPath $c) { return (Resolve-Path $c).Path }
    }
    $cmd = Get-Command nssm -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "Service $ServiceName not found."
    exit 0
}

$nssm = Find-Nssm -Hint $NssmPath
if ($nssm) {
    & $nssm stop $ServiceName confirm 2>$null
    & $nssm remove $ServiceName confirm
} else {
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName | Out-Null
}

Write-Host "Service $ServiceName removed."
