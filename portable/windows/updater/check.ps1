# Thin wrapper: check for updates only
param()
& "$PSScriptRoot\update.ps1" -Action Check
exit $LASTEXITCODE
