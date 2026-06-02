param(
  [string]$RecordFile = ""
)

$ErrorActionPreference = "Stop"

$serverScript = Join-Path $PSScriptRoot "post_composer_server.py"
$pythonExe = (Get-Command python).Source
$arguments = @($serverScript, "--manage-stop")
if (-not [string]::IsNullOrWhiteSpace($RecordFile)) {
  $arguments += @("--record-file", $RecordFile)
}

& $pythonExe @arguments
exit $LASTEXITCODE
