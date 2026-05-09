@echo off
setlocal ENABLEEXTENSIONS DISABLEDELAYEDEXPANSION
cd /d "%~dp0"
title Own Messenger Server v0.2.39

set "VERSION=v0.2.39"
set "TOOLS_DIR=%CD%\.tools"
set "NODE_DIR=%TOOLS_DIR%\node"
set "FFMPEG_DIR=%TOOLS_DIR%\ffmpeg"
set "FFMPEG_EXE=%FFMPEG_DIR%\bin\ffmpeg.exe"
set "CLAMAV_DIR=%TOOLS_DIR%\clamav"
set "CADDY_DIR=%TOOLS_DIR%\caddy"
set "CADDY_EXE=%CADDY_DIR%\caddy.exe"
set "CACHE_DIR=%TOOLS_DIR%\cache"
set "NPM_CACHE_DIR=%TOOLS_DIR%\npm-cache"
set "NPM_MARKER=%TOOLS_DIR%\npm-installed-%VERSION%.ok"
set "CLAMSCAN_EXE=%CLAMAV_DIR%\clamscan.exe"
set "FRESHCLAM_EXE=%CLAMAV_DIR%\freshclam.exe"
set "PATH=%NODE_DIR%;%FFMPEG_DIR%\bin;%CADDY_DIR%;%CLAMAV_DIR%;%PATH%"
set "OMS_TOOLS_DIR=%TOOLS_DIR%"
set "OMS_NODE_DIR=%NODE_DIR%"
set "OMS_FFMPEG_DIR=%FFMPEG_DIR%"
set "OMS_CLAMAV_DIR=%CLAMAV_DIR%"
set "OMS_CADDY_DIR=%CADDY_DIR%"

echo ============================================================
echo  Own Messenger Server %VERSION% - Windows Starter
echo ============================================================
echo.
echo Diese eine BAT installiert automatisch:
echo  - Portable Node.js
echo  - npm Abhaengigkeiten
echo  - Portable ffmpeg fuer Audio/Video und Metadaten-Entfernung
echo  - Caddy HTTPS Reverse Proxy fuer verschluesselte Verbindung
echo  - optional ClamAV Virenscanner, wenn Download klappt
echo.
echo Schnellstart: Bereits installierte Tools werden uebersprungen.
echo Downloads und npm-Pakete werden in .tools\cache behalten.
echo.

if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%" >nul 2>&1
if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%" >nul 2>&1
if not exist "%NPM_CACHE_DIR%" mkdir "%NPM_CACHE_DIR%" >nul 2>&1

REM ------------------------------------------------------------
REM Portable Node.js installieren
REM ------------------------------------------------------------
set "NEED_NODE_INSTALL=0"
if exist "%NODE_DIR%\node.exe" (
  for /f "delims=" %%V in ('"%NODE_DIR%\node.exe" -p "process.versions.node" 2^>nul') do set "NODE_VER=%%V"
  for /f "tokens=1 delims=." %%A in ("%NODE_VER%") do set "NODE_MAJOR=%%A"
  if "%NODE_MAJOR%"=="20" (
    echo [OK] Portable Node.js 20 LTS gefunden: %NODE_DIR%
  ) else (
    echo [INFO] Portable Node.js ist Version %NODE_VER%. Fuer whatsapp-web.js wird automatisch Node 20 LTS installiert.
    set "NEED_NODE_INSTALL=1"
  )
) else (
  set "NEED_NODE_INSTALL=1"
)

if "%NEED_NODE_INSTALL%"=="1" (
  echo [1/6] Portable Node.js 20 LTS wird heruntergeladen und entpackt...
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\download-portable-node.ps1" -ToolsDir "%TOOLS_DIR%" -NodeDir "%NODE_DIR%"
  if errorlevel 1 (
    echo.
    echo [FEHLER] Node.js konnte nicht automatisch installiert werden.
    echo Pruefe Internet/Firewall oder starte die BAT erneut.
    pause
    exit /b 1
  )
)

echo.
echo [2/6] Node/NPM Versionen:
"%NODE_DIR%\node.exe" --version
set "NODE_VER="
set "NODE_MAJOR="
for /f "delims=" %%V in ('"%NODE_DIR%\node.exe" -p "process.versions.node" 2^>nul') do set "NODE_VER=%%V"
for /f "tokens=1 delims=." %%A in ("%NODE_VER%") do set "NODE_MAJOR=%%A"
if not "%NODE_MAJOR%"=="20" (
  echo [WARNUNG] Node-Version konnte nicht auf 20 LTS gesetzt werden. Aktuell: %NODE_VER%
)
call "%NODE_DIR%\npm.cmd" --version
if errorlevel 1 (
  echo.
  echo [FEHLER] npm konnte nicht gestartet werden.
  pause
  exit /b 1
)

REM ------------------------------------------------------------
REM Portable ffmpeg installieren
REM ------------------------------------------------------------
echo.
if exist "%FFMPEG_EXE%" (
  echo [OK] ffmpeg gefunden: %FFMPEG_EXE%
) else (
  echo [3/7] Portable ffmpeg wird heruntergeladen und entpackt...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $tools=$env:OMS_TOOLS_DIR; $ffmpegDir=$env:OMS_FFMPEG_DIR; New-Item -ItemType Directory -Force -Path $tools | Out-Null; $url='https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip'; $cache=Join-Path $tools 'cache'; New-Item -ItemType Directory -Force -Path $cache | Out-Null; $zip=Join-Path $cache 'ffmpeg-win64.zip'; if(!(Test-Path $zip)){ Write-Host 'Download: ffmpeg-win64.zip'; Invoke-WebRequest -Uri $url -OutFile $zip }; $extract=Join-Path $tools 'ffmpeg-extract'; if(Test-Path $extract){ Remove-Item $extract -Recurse -Force }; Expand-Archive -Path $zip -DestinationPath $extract -Force; $exe=(Get-ChildItem $extract -Recurse -Filter ffmpeg.exe | Select-Object -First 1); if(!$exe){ throw 'ffmpeg.exe wurde nicht gefunden.' }; $root=$exe.Directory.Parent.FullName; if(Test-Path $ffmpegDir){ Remove-Item $ffmpegDir -Recurse -Force }; Move-Item -Path $root -Destination $ffmpegDir; Remove-Item $extract -Recurse -Force; Write-Host 'ffmpeg portable ist bereit.'"
  if errorlevel 1 (
    echo [WARNUNG] ffmpeg konnte nicht automatisch installiert werden.
    echo           Audio/Video-Re-Encode funktioniert dann nicht sicher.
  )
)
if exist "%FFMPEG_EXE%" (
  "%FFMPEG_EXE%" -version | findstr /i "ffmpeg version" >nul 2>&1
  echo [OK] ffmpeg ist einsatzbereit.
)

REM ------------------------------------------------------------
REM Portable Caddy fuer HTTPS installieren
REM ------------------------------------------------------------
echo.
if exist "%CADDY_EXE%" (
  echo [OK] Caddy gefunden: %CADDY_EXE%
) else (
  echo [4/7] Portable Caddy fuer HTTPS wird heruntergeladen und entpackt...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $tools=$env:OMS_TOOLS_DIR; $caddyDir=$env:OMS_CADDY_DIR; New-Item -ItemType Directory -Force -Path $tools | Out-Null; $api='https://api.github.com/repos/caddyserver/caddy/releases/latest'; $rel=Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent'='OwnMessengerServer' }; $asset=$rel.assets | Where-Object { $_.browser_download_url -match 'windows_amd64.*\.zip$' -or $_.name -match 'windows_amd64.*\.zip$' } | Select-Object -First 1; if(!$asset){ throw 'Kein Caddy Windows amd64 ZIP gefunden.' }; $cache=Join-Path $tools 'cache'; New-Item -ItemType Directory -Force -Path $cache | Out-Null; $zip=Join-Path $cache 'caddy-windows-amd64.zip'; if(!(Test-Path $zip)){ Write-Host ('Download: '+$asset.name); Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip }; $extract=Join-Path $tools 'caddy-extract'; if(Test-Path $extract){ Remove-Item $extract -Recurse -Force }; Expand-Archive -Path $zip -DestinationPath $extract -Force; $exe=(Get-ChildItem $extract -Recurse -Filter caddy.exe | Select-Object -First 1); if(!$exe){ throw 'caddy.exe wurde nicht gefunden.' }; if(Test-Path $caddyDir){ Remove-Item $caddyDir -Recurse -Force }; New-Item -ItemType Directory -Force -Path $caddyDir | Out-Null; Copy-Item $exe.FullName (Join-Path $caddyDir 'caddy.exe') -Force; Remove-Item $extract -Recurse -Force; Write-Host 'Caddy portable ist bereit.'"
  if errorlevel 1 (
    echo [WARNUNG] Caddy konnte nicht automatisch installiert werden.
    echo           HTTPS ueber Domain kann dann nicht automatisch gestartet werden.
  )
)
if exist "%CADDY_EXE%" (
  "%CADDY_EXE%" version
  echo [OK] Caddy ist einsatzbereit.
)

REM ------------------------------------------------------------
REM Optional ClamAV installieren
REM ------------------------------------------------------------
echo.
if exist "%CLAMSCAN_EXE%" (
  echo [OK] ClamAV gefunden: %CLAMSCAN_EXE%
) else (
  echo [5/7] ClamAV Virenscanner wird optional heruntergeladen...
  echo       Falls das nicht klappt, startet der Server trotzdem mit sicherem Re-Encode.
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $tools=$env:OMS_TOOLS_DIR; $clamDir=$env:OMS_CLAMAV_DIR; New-Item -ItemType Directory -Force -Path $tools | Out-Null; $api='https://api.github.com/repos/Cisco-Talos/clamav/releases/latest'; $rel=Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent'='OwnMessengerServer' }; $asset=$rel.assets | Where-Object { $_.browser_download_url -match 'win.*x64.*\.zip$' -or $_.name -match 'win.*x64.*\.zip$' } | Select-Object -First 1; if(!$asset){ throw 'Kein ClamAV Windows x64 ZIP gefunden.' }; $cache=Join-Path $tools 'cache'; New-Item -ItemType Directory -Force -Path $cache | Out-Null; $zip=Join-Path $cache 'clamav-win64.zip'; if(!(Test-Path $zip)){ Write-Host ('Download: '+$asset.name); Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip }; $extract=Join-Path $tools 'clamav-extract'; if(Test-Path $extract){ Remove-Item $extract -Recurse -Force }; Expand-Archive -Path $zip -DestinationPath $extract -Force; $scan=(Get-ChildItem $extract -Recurse -Filter clamscan.exe | Select-Object -First 1); if(!$scan){ throw 'clamscan.exe wurde nicht gefunden.' }; $root=$scan.Directory.FullName; if(Test-Path $clamDir){ Remove-Item $clamDir -Recurse -Force }; Move-Item -Path $root -Destination $clamDir; Remove-Item $extract -Recurse -Force; Write-Host 'ClamAV portable ist bereit.'"
  if errorlevel 1 (
    echo [WARNUNG] ClamAV konnte nicht automatisch installiert werden.
    echo           Der Server nutzt trotzdem Dateityp-Blockierung und Re-Encode.
  )
)
if exist "%CLAMSCAN_EXE%" (
  echo [OK] ClamAV ist vorhanden.
  if exist "%FRESHCLAM_EXE%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $tools=$env:OMS_TOOLS_DIR; $clam=$env:OMS_CLAMAV_DIR; $fresh=Join-Path $clam 'freshclam.exe'; $db=Join-Path $clam 'database'; New-Item -ItemType Directory -Force -Path $db | Out-Null; $conf=Join-Path $clam 'freshclam.conf'; if(!(Test-Path $conf)){ Set-Content -Path $conf -Value @('DatabaseDirectory "'+$db+'"','DatabaseMirror database.clamav.net') }; $marker=Join-Path $tools 'clamav-updated.txt'; $today=Get-Date -Format yyyy-MM-dd; if((Test-Path $marker) -and ((Get-Content $marker -ErrorAction SilentlyContinue | Select-Object -First 1) -eq $today)){ Write-Host '[OK] ClamAV Signaturen wurden heute schon geprueft. Update wird uebersprungen.'; exit 0 }; Write-Host '[INFO] ClamAV Signaturen werden aktualisiert (max. 1x pro Tag). Das kann dauern...'; & $fresh --config-file=$conf --datadir=$db; if($LASTEXITCODE -eq 0){ Set-Content -Path $marker -Value $today; Write-Host '[OK] ClamAV Signaturen aktualisiert.'; exit 0 } else { Write-Host '[WARNUNG] freshclam Update fehlgeschlagen. Scanner bleibt optional/auto.'; exit 0 }"
  )
)

REM ------------------------------------------------------------
REM .env erstellen und sichere Pfade/Defaults setzen
REM ------------------------------------------------------------
echo.
echo [5/7] Projekt und Sicherheit vorbereiten...
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo [OK] .env wurde aus .env.example erstellt.
  ) else (
    echo PORT=3000>.env
    echo HOST=127.0.0.1>>.env
    echo HTTPS_DOMAIN=>>.env
    echo PUBLIC_BASE_URL=https://DEINE-DOMAIN>>.env
    echo REQUIRE_HTTPS=1>>.env
    echo APP_TOKEN=>>.env
    echo APP_KEY_SINGLE_DEVICE=1>>.env
    echo SECURITY_DELETE_WA_SESSION_ON_LOCKDOWN=1>>.env
    echo SECURITY_AUDIT_LOG=1>>.env
    echo SECURITY_AUTH_FAIL_LIMIT=20>>.env
    echo TRUST_PROXY=1>>.env
    echo CORS_ORIGIN=*>>.env
    echo PROVIDER=wwebjs>>.env
    echo DB_FILE=data/own_messenger.sqlite>>.env
    echo UPLOAD_DIR=./uploads>>.env
    echo MAX_UPLOAD_MB=50>>.env
    echo SECURE_MEDIA_REQUIRE_REENCODE=1>>.env
    echo SECURE_MEDIA_ALLOW_DOCUMENTS=0>>.env
    echo SECURE_MEDIA_CLAMAV=auto>>.env
    echo FFMPEG_PATH=.tools\ffmpeg\bin\ffmpeg.exe>>.env
    echo CLAMSCAN_PATH=.tools\clamav\clamscan.exe>>.env
    echo [OK] .env wurde neu erstellt.
  )
) else (
  echo [OK] .env existiert bereits.
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='.env'; $t=[IO.File]::ReadAllText($p); function SetEnvLine([string]$k,[string]$v){ $script:t = if($script:t -match ('(?m)^'+[regex]::Escape($k)+'=')){ [regex]::Replace($script:t,('(?m)^'+[regex]::Escape($k)+'=.*'),($k+'='+$v)) } else { $script:t.TrimEnd()+[Environment]::NewLine+$k+'='+$v+[Environment]::NewLine } }; SetEnvLine 'SECURE_MEDIA_REQUIRE_IMAGE_REENCODE' '1'; SetEnvLine 'SECURE_MEDIA_MAX_IMAGE_DIMENSION' '4096'; SetEnvLine 'SECURE_MEDIA_IMAGE_QUALITY' '95'; SetEnvLine 'SECURE_MEDIA_IMAGE_NO_CHROMA_SUBSAMPLING' '1'; SetEnvLine 'SECURE_MEDIA_REQUIRE_REENCODE' '1'; SetEnvLine 'SECURE_MEDIA_ALLOW_DOCUMENTS' '0'; SetEnvLine 'FFMPEG_PATH' '.tools\ffmpeg\bin\ffmpeg.exe'; SetEnvLine 'CLAMSCAN_PATH' '.tools\clamav\clamscan.exe'; SetEnvLine 'APP_KEY_SINGLE_DEVICE' '1'; SetEnvLine 'SECURITY_DELETE_WA_SESSION_ON_LOCKDOWN' '1'; SetEnvLine 'SECURITY_AUDIT_LOG' '1'; SetEnvLine 'SECURITY_AUTH_FAIL_LIMIT' '20'; SetEnvLine 'REQUIRE_HTTPS' '1'; if($t -notmatch '(?m)^HTTPS_DOMAIN='){ SetEnvLine 'HTTPS_DOMAIN' '' }; SetEnvLine 'TRUST_PROXY' '1'; if(Test-Path '.tools\clamav\clamscan.exe'){ SetEnvLine 'SECURE_MEDIA_CLAMAV' 'auto' } elseif($t -notmatch '(?m)^SECURE_MEDIA_CLAMAV='){ SetEnvLine 'SECURE_MEDIA_CLAMAV' 'auto' }; [IO.File]::WriteAllText($p,$t)"

if not exist "data" mkdir "data" >nul 2>&1
if not exist "uploads" mkdir "uploads" >nul 2>&1
if not exist "uploads\_incoming" mkdir "uploads\_incoming" >nul 2>&1
if not exist "uploads\safe" mkdir "uploads\safe" >nul 2>&1
if not exist "uploads\quarantine" mkdir "uploads\quarantine" >nul 2>&1

echo.
echo [SICHERHEIT] Setup-Code pruefen...
set "CURRENT_SETUP_CODE="

REM Wichtig: App-Key wird NICHT mehr beim Start erzeugt.
REM Der App-Key entsteht erst, wenn der WhatsApp-QR wirklich gescannt wurde.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='SETUP_CODE.txt'; $bad=$true; if(Test-Path $p){ $raw=Get-Content -Raw $p; $m=[regex]::Match($raw,'(?m)^[A-Z0-9]{16,}$'); if($m.Success){ $bad=$false; $code=$m.Value.Trim() } }; if($bad){ $bytes=New-Object byte[] 10; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); $code=([BitConverter]::ToString($bytes)).Replace('-',''); $txt=@('Own Messenger Setup-Code','========================','',$code,'','Diesen Code auf /qr.php eingeben.','Erst nach WhatsApp-QR-Scan wird der App-Key erstellt.',''); [IO.File]::WriteAllText($p,($txt -join [Environment]::NewLine),[Text.UTF8Encoding]::new($false)) }; Write-Output $code" > ".setup_code.tmp"
if errorlevel 1 (
  echo [FEHLER] Setup-Code konnte nicht erstellt werden.
  pause
  exit /b 1
)
if exist ".setup_code.tmp" (
  set /p CURRENT_SETUP_CODE=<".setup_code.tmp"
  del ".setup_code.tmp" >nul 2>&1
)
if "%CURRENT_SETUP_CODE%"=="" (
  echo [FEHLER] SETUP_CODE.txt ist leer. Bitte BAT erneut starten.
  pause
  exit /b 1
)

echo.
echo WICHTIG: Setup-Code fuer QR-Seite:
echo %CURRENT_SETUP_CODE%
echo [OK] App-Key wird erst nach erfolgreichem WhatsApp-Scan erstellt.
echo      Danach steht er auf /qr.php und fuer Hauptnummer auch in APP_KEY.txt.

REM ------------------------------------------------------------
REM HTTPS / Caddy konfigurieren
REM ------------------------------------------------------------
echo.
echo [6/7] HTTPS Schutz vorbereiten...
set "CURRENT_HTTPS_DOMAIN="
for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
  if /I "%%A"=="HTTPS_DOMAIN" set "CURRENT_HTTPS_DOMAIN=%%B"
)
if "%CURRENT_HTTPS_DOMAIN%"=="" (
  echo.
  echo Fuer echte Verschluesselung im Internet brauchst du eine Domain,
  echo die per DNS auf diesen Server zeigt, z.B. chat.deinedomain.de
  echo Eine reine http://IP:3000 Adresse ist NICHT sicher.
  echo.
  set /p CURRENT_HTTPS_DOMAIN=HTTPS-Domain eingeben ^(leer = nur lokal/unsicher nicht empfohlen^): 
)
for /f "usebackq delims=" %%D in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=$env:CURRENT_HTTPS_DOMAIN.Trim(); $d=$d -replace '^https?://',''; $d=$d.TrimEnd('/'); Write-Output $d"`) do set "CURRENT_HTTPS_DOMAIN=%%D"
if not "%CURRENT_HTTPS_DOMAIN%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='.env'; $domain=$env:CURRENT_HTTPS_DOMAIN; $t=[IO.File]::ReadAllText($p); function SetEnvLine([string]$k,[string]$v){ $script:t = if($script:t -match ('(?m)^'+[regex]::Escape($k)+'=')){ [regex]::Replace($script:t,('(?m)^'+[regex]::Escape($k)+'=.*'),($k+'='+$v)) } else { $script:t.TrimEnd()+[Environment]::NewLine+$k+'='+$v+[Environment]::NewLine } }; SetEnvLine 'HTTPS_DOMAIN' $domain; SetEnvLine 'PUBLIC_BASE_URL' ('https://'+$domain); SetEnvLine 'HOST' '127.0.0.1'; SetEnvLine 'TRUST_PROXY' '1'; SetEnvLine 'REQUIRE_HTTPS' '1'; SetEnvLine 'CORS_ORIGIN' ('https://'+$domain); SetEnvLine 'SERVER_URL' 'http://127.0.0.1:3000'; [IO.File]::WriteAllText($p,$t)"
  >Caddyfile echo %CURRENT_HTTPS_DOMAIN% {
  >>Caddyfile echo     encode zstd gzip
  >>Caddyfile echo     header Strict-Transport-Security "max-age=31536000; includeSubDomains"
  >>Caddyfile echo     reverse_proxy 127.0.0.1:3000 {
  >>Caddyfile echo         header_up Host {host}
  >>Caddyfile echo         header_up X-Real-IP {remote_host}
  >>Caddyfile echo         header_up X-Forwarded-For {remote_host}
  >>Caddyfile echo         header_up X-Forwarded-Proto {scheme}
  >>Caddyfile echo     }
  >>Caddyfile echo }
  set "HTTPS_ENABLED=1"
  echo [OK] HTTPS ist vorbereitet: https://%CURRENT_HTTPS_DOMAIN%
  echo      Caddy holt beim Start automatisch ein Zertifikat.
) else (
  set "HTTPS_ENABLED=0"
  echo [WARNUNG] Keine Domain eingetragen. Internetbetrieb ohne HTTPS ist unsicher.
  echo           Fuer sicheren Betrieb Domain in .env bei HTTPS_DOMAIN eintragen und BAT neu starten.
)

REM ------------------------------------------------------------
REM npm dependencies installieren
REM ------------------------------------------------------------
echo.
echo [7/7] npm Abhaengigkeiten pruefen/installieren...
set "NEED_NPM_INSTALL=0"
if not exist "node_modules" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\dotenv\package.json" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\express\package.json" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\ws\package.json" set "NEED_NPM_INSTALL=1"
if not exist "node_modules\qrcode\package.json" set "NEED_NPM_INSTALL=1"
if not exist "%NPM_MARKER%" set "NEED_NPM_INSTALL=1"

if "%NEED_NPM_INSTALL%"=="0" (
  echo [OK] node_modules fuer %VERSION% gefunden. npm install wird uebersprungen.
) else (
  echo [INFO] npm install wird ausgefuehrt, weil Abhaengigkeiten fehlen oder Version neu ist.
  echo        Cache: %NPM_CACHE_DIR%
  call "%NODE_DIR%\npm.cmd" install --omit=dev --no-audit --fund=false --prefer-offline --cache "%NPM_CACHE_DIR%"
  if errorlevel 1 (
    echo.
    echo [FEHLER] npm install ist fehlgeschlagen.
    echo Tipp: Antivirus/Firewall pruefen oder Fenster erneut als Administrator starten.
    pause
    exit /b 1
  )
  >"%NPM_MARKER%" echo ok
  echo [OK] npm Abhaengigkeiten installiert und markiert.
)

echo.
if "%HTTPS_ENABLED%"=="1" (
  echo [NETZWERK] Windows-Firewall-Regeln fuer HTTPS ^(80/443^) werden versucht...
  netsh advfirewall firewall add rule name="Own Messenger HTTPS 80" dir=in action=allow protocol=TCP localport=80 >nul 2>&1
  netsh advfirewall firewall add rule name="Own Messenger HTTPS 443" dir=in action=allow protocol=TCP localport=443 >nul 2>&1
  echo [OK] Falls Administratorrechte vorhanden waren, sind TCP 80/443 freigegeben.
) else (
  echo [NETZWERK] Windows-Firewall-Regel fuer Port 3000 wird versucht ^(nur Testbetrieb^)...
  netsh advfirewall firewall add rule name="Own Messenger Server 3000" dir=in action=allow protocol=TCP localport=3000 >nul 2>&1
)

echo.
echo [SICHERHEIT] Medien-Schutz aktiv:
echo  Bilder:      Re-Encode + Metadaten entfernen
echo  Audio/Video: Re-Encode mit ffmpeg, wenn Installation erfolgreich war
echo  Dokumente:   blockiert
echo  Virenscan:   ClamAV auto, wenn Installation/Signaturen vorhanden sind
echo  Quarantaene: uploads\quarantine

echo.
if "%HTTPS_ENABLED%"=="1" (
  echo [NETZWERK] Sichere Adresse fuer Handy/App:
  echo   https://%CURRENT_HTTPS_DOMAIN%/health
  echo   In der App eintragen: https://%CURRENT_HTTPS_DOMAIN%
) else (
  echo [NETZWERK] Test-Adressen ^(nicht fuer Internet, nicht verschluesselt^):
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '  http://' + $_.IPAddress + ':3000/health' }" 2>nul
  if errorlevel 1 (
    ipconfig | findstr /i "IPv4"
  )
)

echo.
echo ============================================================
echo  Server startet jetzt
echo ============================================================
if "%HTTPS_ENABLED%"=="1" (
  echo  Lokal intern: http://127.0.0.1:3000
  echo  Android-App: https://%CURRENT_HTTPS_DOMAIN%
) else (
  echo  Lokal/Test:  http://localhost:3000
  echo  Android-App: HTTPS-Domain fehlt noch
)
echo  DB-Datei:    data\own_messenger.sqlite
echo  Uploads:     uploads\
echo.
echo  Fenster offen lassen. Beenden mit STRG+C.
echo ============================================================
echo.

if "%HTTPS_ENABLED%"=="1" (
  if exist "%CADDY_EXE%" (
    echo [HTTPS] Caddy wird gestartet...
    start "Own Messenger HTTPS Proxy" /min "%CADDY_EXE%" run --config "%CD%\Caddyfile" --adapter caddyfile
    timeout /t 2 >nul
  ) else (
    echo [FEHLER] HTTPS ist aktiviert, aber Caddy fehlt. BAT erneut starten.
    pause
    exit /b 1
  )
)
call "%NODE_DIR%\npm.cmd" start

echo.
echo Server wurde beendet.
pause
