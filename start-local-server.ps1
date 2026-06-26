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

# Launch python as an INDEPENDENT (detached) process so it survives this task
# host exiting. A blocking `& $PythonExe` would make python a child of the task
# host; when the scheduler terminates the host (~60s on this machine), it would
# take python down with it. Start-Process detaches python to live on its own.
$ServerLogPath = Join-Path $LogDir 'server.log'
$ServerErrPath = Join-Path $LogDir 'server.err.log'
Write-StartupLog "Launching githubhunter server on http://127.0.0.1:$Port/ with $PythonExe (detached)"

$proc = Start-Process -FilePath $PythonExe `
  -ArgumentList @('-m', 'http.server', $Port, '--bind', '127.0.0.1') `
  -WorkingDirectory $ProjectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $ServerLogPath `
  -RedirectStandardError $ServerErrPath `
  -PassThru

Start-Sleep -Seconds 2

if ($proc -and -not $proc.HasExited) {
  Write-StartupLog "Server launched as PID $($proc.Id) on http://127.0.0.1:$Port/ (detached; host exiting)."
  exit 0
}

Write-StartupLog "Server process exited immediately with code $($proc.ExitCode); cannot keep port up."
exit 1
