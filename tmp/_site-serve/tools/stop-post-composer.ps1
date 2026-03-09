$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$repoRoot = Split-Path -Path $toolsDir -Parent
$pidFile = Join-Path (Join-Path $repoRoot "tmp") "post-composer-server.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "No saved post composer process was found."
  exit 0
}

$pidValue = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $pidValue) {
  Remove-Item $pidFile -ErrorAction SilentlyContinue
  Write-Host "PID file was empty, cleaned up."
  exit 0
}

$process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $pidValue -Force
  Write-Host "Stopped post composer server (PID $pidValue)."
} else {
  Write-Host "The saved process was not running anymore."
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
