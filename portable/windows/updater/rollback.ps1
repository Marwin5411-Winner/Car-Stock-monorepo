# Thin wrapper: rollback to a previous release folder version
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$RestoreBackup = ''
)
$args = @('-Action', 'Rollback', '-Version', $Version)
if ($RestoreBackup) {
    $args += @('-RestoreBackup', $RestoreBackup)
}
& "$PSScriptRoot\update.ps1" @args
exit $LASTEXITCODE
