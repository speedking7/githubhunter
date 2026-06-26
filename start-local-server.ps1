$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 4180
$LogDir = Join-Path $ProjectRoot 'logs'
$StartupLog = Join-Path $LogDir 'startup.log'
$ServerLog = Join-Path $LogDir 'server.log'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-StartupLog {
  param([string]$Message)

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $StartupLog -Value "[$timestamp] $Message"
}

$existingListener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1

if ($existingListener) {
  Write-StartupLog "Port $Port is already listening by PID $($existingListener.OwningProcess); skipping startup."
  exit 0
}

$pythonCandidates = @(
  (Join-Path $env:APPDATA 'uv\python\cpython-3.11-windows-x86_64-none\python.exe'),
  (Join-Path $env:LOCALAPPDATA 'hermes\hermes-agent\venv\Scripts\python.exe'),
  ((Get-Command python -ErrorAction SilentlyContinue).Source)
) |
  Where-Object { $_ -and ($_ -notlike '*\WindowsApps\python.exe') -and (Test-Path -LiteralPath $_) } |
  Select-Object -Unique

$PythonExe = $pythonCandidates | Select-Object -First 1

if (-not $PythonExe) {
  Write-StartupLog 'No usable python.exe found; cannot start local server.'
  exit 1
}

Set-Location -LiteralPath $ProjectRoot
Write-StartupLog "Starting githubhunter from $ProjectRoot on http://127.0.0.1:$Port/ with $PythonExe"

& $PythonExe -m http.server $Port *>> $ServerLog
$exitCode = $LASTEXITCODE

Write-StartupLog "python http.server exited with code $exitCode."
exit $exitCode
