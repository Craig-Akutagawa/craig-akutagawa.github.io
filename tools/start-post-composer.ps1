param(
  [int]$Port = 4173,
  [switch]$NoOpen,
  [string]$RecordFile = "",
  [string]$EntryPoint = "post-composer"
)

$serverScript = Join-Path $PSScriptRoot "post_composer_server.py"
$pythonExe = (Get-Command python).Source
$arguments = @($serverScript, "--manage-start", "--port", [string]$Port, "--entry-point", $EntryPoint)
if (-not [string]::IsNullOrWhiteSpace($RecordFile)) {
  $arguments += @("--record-file", $RecordFile)
}

& $pythonExe @arguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not $NoOpen) {
  Start-Process "http://127.0.0.1:$Port/post-composer.html"
}
