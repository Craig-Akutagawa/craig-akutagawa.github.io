param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$repoRoot = Split-Path -Path $toolsDir -Parent
$tmpDir = Join-Path $repoRoot "tmp"
$pidFile = Join-Path $tmpDir "post-composer-server.pid"
$logFile = Join-Path $tmpDir "post-composer-server.log"
$errFile = Join-Path $tmpDir "post-composer-server.err.log"
$pythonExe = (Get-Command python).Source
$url = "http://127.0.0.1:$Port/post-composer.html"

function Test-ComposerServer {
  param([int]$ServerPort)

  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $client.Connect("127.0.0.1", $ServerPort)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Path $tmpDir)) {
  New-Item -ItemType Directory -Path $tmpDir | Out-Null
}

if (Test-Path $pidFile) {
  $existingPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if (-not $existingProcess) {
      Remove-Item $pidFile -ErrorAction SilentlyContinue
    }
  }
}

if (-not (Test-ComposerServer -ServerPort $Port)) {
  $process = Start-Process `
    -FilePath $pythonExe `
    -ArgumentList "-m", "http.server", $Port, "--bind", "127.0.0.1", "--directory", $toolsDir `
    -RedirectStandardOutput $logFile `
    -RedirectStandardError $errFile `
    -PassThru

  Set-Content -Path $pidFile -Value $process.Id

  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline) {
    if (Test-ComposerServer -ServerPort $Port) {
      break
    }
    Start-Sleep -Milliseconds 200
  }
}

Start-Process $url

Write-Host ""
Write-Host "Post Composer is running at $url"
Write-Host "This server only listens on 127.0.0.1, so it is only reachable from this computer."
Write-Host ""
Write-Host "To stop it later, run:"
Write-Host "powershell -ExecutionPolicy Bypass -File .\\tools\\stop-post-composer.ps1"
Write-Host ""
