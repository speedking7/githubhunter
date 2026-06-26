$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ProjectRoot 'logs'
$UpdateLog = Join-Path $LogDir 'github-trending-daily-windows.log'
$LockPath = Join-Path $LogDir 'github-trending.lock'

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-UpdateLog {
  param([string]$Message)

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $UpdateLog -Value "[$timestamp] $Message"
}

function Import-DotEnv {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) {
      return
    }

    $separator = $line.IndexOf('=')
    if ($separator -lt 1) {
      return
    }

    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()

    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if (-not $value) {
      return
    }

    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
}

if (Test-Path -LiteralPath $LockPath) {
  $lockAge = (Get-Date) - (Get-Item -LiteralPath $LockPath).LastWriteTime
  if ($lockAge.TotalHours -lt 2) {
    Write-UpdateLog "Recent lock file exists ($([math]::Round($lockAge.TotalMinutes, 1)) minutes old); skipping this run."
    exit 0
  }

  Write-UpdateLog "Stale lock file exists ($([math]::Round($lockAge.TotalMinutes, 1)) minutes old); removing it."
  Remove-Item -LiteralPath $LockPath -Force
}

New-Item -ItemType File -Force -Path $LockPath | Out-Null

try {
  Set-Location -LiteralPath $ProjectRoot
  Import-DotEnv -Path (Join-Path $ProjectRoot '.env')

  $node = (Get-Command node -ErrorAction Stop).Source
  Write-UpdateLog "Starting GitHub trending daily update with $node."

  & $node scripts/fetch-github-trending.mjs --skip-existing *>> $UpdateLog
  if ($LASTEXITCODE -ne 0) {
    throw "fetch-github-trending.mjs exited with code $LASTEXITCODE"
  }

  & $node scripts/generate-rss.mjs *>> $UpdateLog
  if ($LASTEXITCODE -ne 0) {
    throw "generate-rss.mjs exited with code $LASTEXITCODE"
  }

  & $node scripts/build-search-index.mjs *>> $UpdateLog
  if ($LASTEXITCODE -ne 0) {
    throw "build-search-index.mjs exited with code $LASTEXITCODE"
  }

  Write-UpdateLog 'GitHub trending daily update finished successfully.'
}
catch {
  Write-UpdateLog "ERROR: $($_.Exception.Message)"
  exit 1
}
finally {
  Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
