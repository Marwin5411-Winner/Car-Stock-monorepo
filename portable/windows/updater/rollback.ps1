# Thin wrapper: rollback to a previous release folder version
param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$RestoreBackup = ''
)
$updateArgs = @('-Action', 'Rollback', '-Version', $Version)
if ($RestoreBackup) {
    $updateArgs += @('-RestoreBackup', $RestoreBackup)
}
& "$PSScriptRoot\update.ps1" @updateArgs
exit $LASTEXITCODE
