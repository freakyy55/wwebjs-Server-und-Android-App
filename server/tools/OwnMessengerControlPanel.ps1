$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StartBat = Join-Path $ProjectRoot 'START_SERVER_WINDOWS.bat'
$StopScript = Join-Path $ProjectRoot 'scripts\stop-server-windows.ps1'
$SetupFile = Join-Path $ProjectRoot 'SETUP_CODE.txt'
$BaseUrl = 'http://127.0.0.1:3000'
$HealthUrl = "$BaseUrl/health"
$ControlStatusUrl = "$BaseUrl/api/local/control/status"
$script:LastStatus = $null

function Get-SetupCode {
  if (!(Test-Path $SetupFile)) { return '' }
  $raw = Get-Content -Raw $SetupFile
  $m = [regex]::Match($raw, '(?m)^\s*([A-Z0-9]{16,})\s*$')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return ''
}

function Show-Info($text, $title='Own Messenger') {
  [System.Windows.Forms.MessageBox]::Show($text, $title, 'OK', 'Information') | Out-Null
}

function Confirm-Action($text) {
  return ([System.Windows.Forms.MessageBox]::Show($text, 'Own Messenger', 'YesNo', 'Warning') -eq 'Yes')
}

function Start-OwnMessengerServer {
  if (!(Test-Path $StartBat)) { Show-Info 'START_SERVER_WINDOWS.bat wurde nicht gefunden.'; return }
  Start-Process -FilePath $StartBat -WorkingDirectory $ProjectRoot
}

function Stop-OwnMessengerServer {
  if (Test-Path $StopScript) {
    powershell -NoProfile -ExecutionPolicy Bypass -File $StopScript -ProjectRoot $ProjectRoot | Out-Null
  } else {
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$ProjectRoot*" } | Stop-Process -Force
  }
}

function Invoke-ControlPost($path, $body=$null) {
  $uri = "$BaseUrl$path"
  if ($null -eq $body) {
    return Invoke-RestMethod -Uri $uri -Method Post -TimeoutSec 60
  }
  return Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 5) -TimeoutSec 60
}

function Get-ControlStatus {
  try {
    $script:LastStatus = Invoke-RestMethod -Uri $ControlStatusUrl -TimeoutSec 3
    return $script:LastStatus
  } catch {
    try {
      $h = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
      $script:LastStatus = $h
      return $h
    } catch {
      $script:LastStatus = $null
      return $null
    }
  }
}

function Selected-AccountId {
  if ($grid.SelectedRows.Count -gt 0) { return [string]$grid.SelectedRows[0].Cells['id'].Value }
  if ($grid.Rows.Count -gt 0) { return [string]$grid.Rows[0].Cells['id'].Value }
  return ''
}

function Open-QrForSelected {
  $id = Selected-AccountId
  $code = Get-SetupCode
  if ($id) {
    if ($code) { Start-Process "$BaseUrl/qr.php?setup=$code&account=$id" }
    else { Start-Process "$BaseUrl/qr.php?account=$id" }
  } else {
    Start-Process "$BaseUrl/qr.php"
  }
}

function Refresh-Status {
  $s = Get-ControlStatus
  $grid.Rows.Clear()
  if ($null -eq $s) {
    $statusLabel.Text = 'Server: OFFLINE'
    $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 120, 120)
    $detailsBox.Text = "Server ist offline oder startet noch.`r`n`r`nStarten: 'Server starten' klicken.`r`nWenn gerade gestartet wurde: nach ein paar Sekunden erneut aktualisieren."
    return
  }
  $version = if ($s.version) { $s.version } else { '?' }
  $statusLabel.Text = "Server: ONLINE   Version: $version"
  $statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(92, 230, 166)
  $accounts = @($s.accounts)
  foreach ($a in $accounts) {
    $ready = if ($a.ready) { 'JA' } else { 'nein' }
    $session = if ($a.hasSession) { 'ja' } else { 'nein' }
    $key = if ($a.appKeyReady) { 'ja' } else { 'nein' }
    $qr = if ($a.hasQr) { 'ja' } else { 'nein' }
    [void]$grid.Rows.Add($a.id, $a.name, $a.state, $ready, $session, $qr, $key)
  }
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("Aktualisiert: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
  $lines.Add("Projekt: $ProjectRoot")
  $lines.Add("Setup-Code: $(if ($s.setupCode) { $s.setupCode } else { Get-SetupCode })")
  $lines.Add('')
  $lines.Add('Hinweis: Leere Slots wa2-wa5 nicht alle gleichzeitig starten. Einen Slot auswählen, starten/koppeln, dann scannen oder Pairing-Code erzeugen.')
  foreach ($a in $accounts) {
    if ($a.lastPairingCode) { $lines.Add("Pairing-Code $($a.id): $($a.lastPairingCode) fuer $($a.lastPairingPhone)") }
    if ($a.lastError) { $lines.Add("Fehler $($a.id): $($a.lastError)") }
  }
  $detailsBox.Text = ($lines -join [Environment]::NewLine)
}

# ---------- UI ----------
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Own Messenger Kontrollpanel'
$form.Size = New-Object System.Drawing.Size(980, 700)
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = New-Object System.Drawing.Size(900, 640)
$form.BackColor = [System.Drawing.Color]::FromArgb(8, 16, 22)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'
$header.Height = 86
$header.BackColor = [System.Drawing.Color]::FromArgb(13, 29, 35)
$form.Controls.Add($header)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Own Messenger Server'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::White
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(22, 14)
$header.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'Bis zu 5 WhatsApp-Nummern starten, stoppen, koppeln und überwachen.'
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(168, 186, 193)
$subtitle.AutoSize = $true
$subtitle.Location = New-Object System.Drawing.Point(26, 54)
$header.Controls.Add($subtitle)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Text = 'Server: pruefe...'
$statusLabel.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$statusLabel.ForeColor = [System.Drawing.Color]::FromArgb(255, 204, 102)
$statusLabel.AutoSize = $true
$statusLabel.Anchor = 'Top,Right'
$statusLabel.Location = New-Object System.Drawing.Point(720, 18)
$header.Controls.Add($statusLabel)

function New-Button($text, $x, $y, $w, $handler, $kind='normal') {
  $btn = New-Object System.Windows.Forms.Button
  $btn.Text = $text
  $btn.Size = New-Object System.Drawing.Size($w, 38)
  $btn.Location = New-Object System.Drawing.Point($x, $y)
  $btn.FlatStyle = 'Flat'
  $btn.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
  $btn.ForeColor = [System.Drawing.Color]::White
  if ($kind -eq 'green') { $btn.BackColor = [System.Drawing.Color]::FromArgb(40, 172, 116) }
  elseif ($kind -eq 'red') { $btn.BackColor = [System.Drawing.Color]::FromArgb(190, 74, 74) }
  else { $btn.BackColor = [System.Drawing.Color]::FromArgb(34, 54, 64) }
  $btn.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(64, 94, 106)
  $btn.Add_Click($handler)
  $form.Controls.Add($btn)
  return $btn
}

# Server buttons
New-Button 'Server starten' 24 108 150 { Start-OwnMessengerServer; Start-Sleep -Milliseconds 600; Refresh-Status } 'green' | Out-Null
New-Button 'Server stoppen' 184 108 150 { Stop-OwnMessengerServer; Start-Sleep -Milliseconds 800; Refresh-Status } 'red' | Out-Null
New-Button 'Server neu starten' 344 108 170 { Stop-OwnMessengerServer; Start-Sleep -Seconds 1; Start-OwnMessengerServer; Start-Sleep -Milliseconds 700; Refresh-Status } | Out-Null
New-Button 'Status aktualisieren' 524 108 170 { Refresh-Status } | Out-Null
New-Button 'Lokal öffnen' 704 108 120 { Start-Process "$BaseUrl/" } | Out-Null
New-Button 'QR öffnen' 834 108 110 { Open-QrForSelected } 'green' | Out-Null

$grid = New-Object System.Windows.Forms.DataGridView
$grid.Location = New-Object System.Drawing.Point(24, 166)
$grid.Size = New-Object System.Drawing.Size(920, 230)
$grid.Anchor = 'Top,Left,Right'
$grid.BackgroundColor = [System.Drawing.Color]::FromArgb(13, 29, 35)
$grid.BorderStyle = 'None'
$grid.GridColor = [System.Drawing.Color]::FromArgb(40, 64, 74)
$grid.EnableHeadersVisualStyles = $false
$grid.ColumnHeadersDefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(18, 40, 48)
$grid.ColumnHeadersDefaultCellStyle.ForeColor = [System.Drawing.Color]::FromArgb(126, 224, 176)
$grid.DefaultCellStyle.BackColor = [System.Drawing.Color]::FromArgb(17, 27, 33)
$grid.DefaultCellStyle.ForeColor = [System.Drawing.Color]::White
$grid.DefaultCellStyle.SelectionBackColor = [System.Drawing.Color]::FromArgb(24, 90, 70)
$grid.DefaultCellStyle.SelectionForeColor = [System.Drawing.Color]::White
$grid.RowHeadersVisible = $false
$grid.SelectionMode = 'FullRowSelect'
$grid.MultiSelect = $false
$grid.AllowUserToAddRows = $false
$grid.AllowUserToDeleteRows = $false
$grid.ReadOnly = $true
$grid.AutoSizeColumnsMode = 'Fill'
@(
  @('id','Slot'), @('name','Name'), @('state','Status'), @('ready','Online'), @('session','Session'), @('qr','QR'), @('key','App-Key')
) | ForEach-Object {
  $col = New-Object System.Windows.Forms.DataGridViewTextBoxColumn
  $col.Name = $_[0]
  $col.HeaderText = $_[1]
  [void]$grid.Columns.Add($col)
}
$form.Controls.Add($grid)

# Account action buttons
New-Button 'Slot starten / koppeln' 24 414 170 {
  $id = Selected-AccountId; if (!$id) { return }
  try { Invoke-ControlPost "/api/local/accounts/$id/start" | Out-Null } catch { Show-Info $_.Exception.Message 'Fehler' }
  Start-Sleep -Milliseconds 400; Refresh-Status
} 'green' | Out-Null
New-Button 'Slot stoppen' 204 414 130 {
  $id = Selected-AccountId; if (!$id) { return }
  try { Invoke-ControlPost "/api/local/accounts/$id/stop" | Out-Null } catch { Show-Info $_.Exception.Message 'Fehler' }
  Start-Sleep -Milliseconds 400; Refresh-Status
} | Out-Null
New-Button 'Slot neu starten' 344 414 150 {
  $id = Selected-AccountId; if (!$id) { return }
  try { Invoke-ControlPost "/api/local/accounts/$id/restart" | Out-Null } catch { Show-Info $_.Exception.Message 'Fehler' }
  Start-Sleep -Milliseconds 400; Refresh-Status
} | Out-Null
New-Button 'Session löschen' 504 414 150 {
  $id = Selected-AccountId; if (!$id) { return }
  if (Confirm-Action "Session fuer $id wirklich loeschen? Diese WhatsApp-Nummer muss danach neu gekoppelt werden.") {
    try { Invoke-ControlPost "/api/local/accounts/$id/reset-session" | Out-Null } catch { Show-Info $_.Exception.Message 'Fehler' }
    Start-Sleep -Milliseconds 500; Refresh-Status
  }
} 'red' | Out-Null
New-Button 'QR für Slot öffnen' 664 414 150 { Open-QrForSelected } 'green' | Out-Null
New-Button 'Projektordner' 824 414 120 { Start-Process $ProjectRoot } | Out-Null

$phoneLabel = New-Object System.Windows.Forms.Label
$phoneLabel.Text = 'Pairing-Code statt QR: Nummer ohne +'
$phoneLabel.ForeColor = [System.Drawing.Color]::FromArgb(168, 186, 193)
$phoneLabel.AutoSize = $true
$phoneLabel.Location = New-Object System.Drawing.Point(24, 472)
$form.Controls.Add($phoneLabel)

$phoneBox = New-Object System.Windows.Forms.TextBox
$phoneBox.Location = New-Object System.Drawing.Point(254, 468)
$phoneBox.Size = New-Object System.Drawing.Size(190, 26)
$phoneBox.BackColor = [System.Drawing.Color]::FromArgb(32, 44, 51)
$phoneBox.ForeColor = [System.Drawing.Color]::White
$phoneBox.BorderStyle = 'FixedSingle'
$phoneBox.Text = '49'
$form.Controls.Add($phoneBox)

New-Button 'Pairing-Code erzeugen' 464 462 180 {
  $id = Selected-AccountId; if (!$id) { return }
  $phone = $phoneBox.Text.Trim()
  if (!$phone -or $phone.Length -lt 8) { Show-Info 'Bitte Telefonnummer international ohne + eingeben, z.B. 491701234567.'; return }
  try {
    $r = Invoke-ControlPost "/api/local/accounts/$id/pairing-code" @{ phone = $phone }
    if ($r.code) { Show-Info ("Pairing-Code fuer ${id}:`r`n`r`n" + $r.code) 'Pairing-Code' }
  } catch { Show-Info $_.Exception.Message 'Fehler' }
  Refresh-Status
} 'green' | Out-Null

New-Button 'Setup-Code anzeigen' 654 462 160 {
  $code = Get-SetupCode
  if (!$code) { $code = 'Noch kein Setup-Code gefunden. Starte den Server einmal.' }
  Show-Info $code 'Setup-Code'
} | Out-Null

$detailsBox = New-Object System.Windows.Forms.TextBox
$detailsBox.Multiline = $true
$detailsBox.ReadOnly = $true
$detailsBox.ScrollBars = 'Vertical'
$detailsBox.Font = New-Object System.Drawing.Font('Consolas', 10)
$detailsBox.Location = New-Object System.Drawing.Point(24, 520)
$detailsBox.Size = New-Object System.Drawing.Size(920, 120)
$detailsBox.Anchor = 'Left,Right,Bottom'
$detailsBox.BackColor = [System.Drawing.Color]::FromArgb(12, 20, 26)
$detailsBox.ForeColor = [System.Drawing.Color]::FromArgb(221, 247, 238)
$detailsBox.BorderStyle = 'FixedSingle'
$form.Controls.Add($detailsBox)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 5000
$timer.Add_Tick({ Refresh-Status })
$timer.Start()
$form.Add_Shown({ Refresh-Status })
[void]$form.ShowDialog()
