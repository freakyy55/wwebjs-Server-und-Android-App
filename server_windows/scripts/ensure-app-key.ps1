$ErrorActionPreference = "Stop"

$envPath = Join-Path (Get-Location) ".env"
$keyPath = Join-Path (Get-Location) "APP_KEY.txt"

if (!(Test-Path $envPath)) {
  New-Item -ItemType File -Path $envPath -Force | Out-Null
}

function Test-BadKey([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $true }
  $v = $value.Trim()
  if ($v -match '^(ECHO ist ausgeschaltet \(OFF\)\.|ECHO is off\.|ECHO is on\.)$') { return $true }
  if ($v.Length -lt 32) { return $true }
  return $false
}

$text = [IO.File]::ReadAllText($envPath)
$match = [regex]::Match($text, '(?m)^APP_TOKEN=(.*)$')
$token = ""
if ($match.Success) {
  $token = $match.Groups[1].Value.Trim()
}

# Wenn .env leer ist, aber APP_KEY.txt schon einen guten Key hat, diesen wiederverwenden.
if (Test-BadKey $token) {
  if (Test-Path $keyPath) {
    $fileToken = (Get-Content -Raw $keyPath -ErrorAction SilentlyContinue).Trim()
    if (!(Test-BadKey $fileToken)) {
      $token = $fileToken
    }
  }
}

if (Test-BadKey $token) {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

if ($text -match '(?m)^APP_TOKEN=') {
  $text = [regex]::Replace($text, '(?m)^APP_TOKEN=.*$', 'APP_TOKEN=' + $token)
} else {
  if ($text.Length -gt 0 -and !$text.EndsWith("`r`n") -and !$text.EndsWith("`n")) {
    $text += [Environment]::NewLine
  }
  $text += 'APP_TOKEN=' + $token + [Environment]::NewLine
}
[IO.File]::WriteAllText($envPath, $text, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($keyPath, $token, [Text.UTF8Encoding]::new($false))
Write-Output $token
