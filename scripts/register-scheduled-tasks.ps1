# Registers githubhunter scheduled tasks, mirroring ph-cn-picks.
# Idempotent: unregisters existing tasks first.

$ErrorActionPreference = 'Stop'
$ScriptsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptsDir
$UserName = $env:USERNAME
$UserFull = "$COMPUTERNAME\$UserName"

$UpdateScript = Join-Path $RepoRoot 'update-daily.ps1'
$ServerScript = Join-Path $RepoRoot 'start-local-server.ps1'

$ActionUpdate = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$UpdateScript`"" -WorkingDirectory $RepoRoot
$ActionServer = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ServerScript`"" -WorkingDirectory $RepoRoot

$Principal = New-ScheduledTaskPrincipal -UserId $UserFull -LogonType Interactive -RunLevel Limited

# Server: long-running keepalive — allow up to a year, do not auto-kill on battery.
$ServerSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 365) -MultipleInstances IgnoreNew
# Daily scrape: short job, 1h ceiling, ignore new instances.
$UpdateSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew

function Register-IfAbsent {
  param([string]$Name, $Action, $Trigger, $Principal, $Settings)

  $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $Name -Confirm:$false
  }
  Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
  Write-Output "registered: $Name  -> $($Action.Arguments)  cwd=$($Action.WorkingDirectory)"
}

# 1) Local static server — start at logon (keeps http://127.0.0.1:4180/ up)
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $UserFull
Register-IfAbsent -Name 'githubhunter-local-server' -Action $ActionServer -Trigger $TriggerLogon -Principal $Principal -Settings $ServerSettings

# 2-4) Daily trending scrape — 3 retries (Beijing 10:10 / 11:10 / 12:10).
# GitHub Trending daily refreshes at UTC 00:00 (= Beijing 08:00); run after that.
$dailyTimes = @('10:10', '11:10', '12:10')
for ($i = 0; $i -lt $dailyTimes.Count; $i++) {
  $name = "githubhunter-daily-update-$($i + 1)"
  $trigger = New-ScheduledTaskTrigger -Daily -At $dailyTimes[$i]
  Register-IfAbsent -Name $name -Action $ActionUpdate -Trigger $trigger -Principal $Principal -Settings $UpdateSettings
}

Write-Output 'done.'
