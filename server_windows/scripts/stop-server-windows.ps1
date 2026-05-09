param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'SilentlyContinue'
$projectRoot = (Resolve-Path $ProjectRoot).Path
$nodeExe = Join-Path $projectRoot '.tools\node\node.exe'
$caddyExe = Join-Path $projectRoot '.tools\caddy\caddy.exe'
$startBat = Join-Path $projectRoot 'START_SERVER_WINDOWS.bat'
$caddyFile = Join-Path $projectRoot 'Caddyfile'
$ownPid = $PID

function Test-MatchOwnMessengerProcess($p) {
  $cmd = [string]$p.CommandLine
  $exe = [string]$p.ExecutablePath
  if ($p.ProcessId -eq $ownPid) { return $false }
  if ($exe -and (Test-Path $nodeExe) -and ($exe -ieq $nodeExe)) { return $true }
  if ($exe -and (Test-Path $caddyExe) -and ($exe -ieq $caddyExe)) { return $true }
  if ($cmd -and $cmd.IndexOf($startBat, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
  if ($cmd -and $cmd.IndexOf($caddyFile, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
  if ($cmd -and $cmd.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and $cmd -match 'node(\.exe)?' -and $cmd -match 'src[\\/]server\.js') { return $true }
  return $false
}

$targets = Get-CimInstance Win32_Process | Where-Object { Test-MatchOwnMessengerProcess $_ } | Sort-Object ProcessId -Unique
if (!$targets -or $targets.Count -eq 0) {
  Write-Host '[INFO] Kein laufender Own Messenger Prozess gefunden.'
  exit 0
}

foreach ($p in $targets) {
  try {
    Write-Host ('[STOP] PID {0} {1}' -f $p.ProcessId, $p.Name)
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  } catch {}
}
Start-Sleep -Seconds 1
Write-Host '[OK] Stop-Befehl ausgefuehrt.'
