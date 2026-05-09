param(
  [string]$ToolsDir,
  [string]$NodeDir
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if ([string]::IsNullOrWhiteSpace($ToolsDir)) {
  if (![string]::IsNullOrWhiteSpace($env:OMS_TOOLS_DIR)) {
    $ToolsDir = $env:OMS_TOOLS_DIR
  } else {
    $ToolsDir = Join-Path (Get-Location) '.tools'
  }
}

if ([string]::IsNullOrWhiteSpace($NodeDir)) {
  if (![string]::IsNullOrWhiteSpace($env:OMS_NODE_DIR)) {
    $NodeDir = $env:OMS_NODE_DIR
  } else {
    $NodeDir = Join-Path $ToolsDir 'node'
  }
}

$baseUrl = 'https://nodejs.org/download/release/latest-v20.x/'
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

Write-Host "ToolsDir: $ToolsDir"
Write-Host "NodeDir : $NodeDir"
Write-Host "Quelle  : $baseUrl"

$sumText = (Invoke-WebRequest -Uri ($baseUrl + 'SHASUMS256.txt') -UseBasicParsing).Content
$fileLine = ($sumText -split "`r?`n" | Where-Object { $_ -match 'node-v.*-win-x64\.zip$' } | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($fileLine)) { throw 'Node.js Windows x64 ZIP wurde nicht gefunden.' }
$fileName = $fileLine -replace '^.*\s+', ''
$zipPath = Join-Path $ToolsDir $fileName

if (!(Test-Path $zipPath)) {
  Write-Host "Download: $fileName"
  Invoke-WebRequest -Uri ($baseUrl + $fileName) -OutFile $zipPath
} else {
  Write-Host "ZIP bereits vorhanden: $fileName"
}

$extractDir = Join-Path $ToolsDir 'node-extract'
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
$nodeFolder = Get-ChildItem $extractDir -Directory | Where-Object { $_.Name -like 'node-v*-win-x64' } | Select-Object -First 1
if (!$nodeFolder) { throw 'Entpackter Node.js Ordner wurde nicht gefunden.' }
if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
Move-Item -Path $nodeFolder.FullName -Destination $NodeDir
Remove-Item $extractDir -Recurse -Force
Write-Host "Node.js portable ist bereit: $NodeDir"
