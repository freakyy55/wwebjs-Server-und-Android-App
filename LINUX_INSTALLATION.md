# Linux-Installation

Diese Anleitung beschreibt die Installation des **OwnMessenger Servers** unter Linux.

Empfohlen für:

```text
Ubuntu
Debian
```

Andere Linux-Distributionen können funktionieren, müssen aber eventuell angepasst werden.

---

## Was diese Installation macht

Die Linux-Installation richtet den Server so ein, dass er dauerhaft und sicher läuft.

Wichtig:

```text
Node.js läuft nicht als root
es wird ein eigener Systembenutzer ownmessenger erstellt
der Server wird nach /opt/ownmessenger/server_linux kopiert
der Server läuft über systemd
der Server startet nach einem Server-Neustart automatisch wieder
```

Der systemd-Service heißt:

```text
ownmessenger
```

Der Linux-Benutzer heißt:

```text
ownmessenger
```

Der Installationsordner ist:

```text
/opt/ownmessenger/server_linux
```

---

## Voraussetzung: Git installieren

Damit der Server aus GitHub geladen werden kann, muss Git installiert sein.

Auf Ubuntu/Debian ausführen:

```bash
sudo apt-get update
sudo apt-get install -y git
```

Wenn du bereits als `root` angemeldet bist, kannst du `sudo` weglassen:

```bash
apt-get update
apt-get install -y git
```

Danach prüfen:

```bash
git --version
```

Wenn eine Versionsnummer angezeigt wird, ist Git installiert.

---

## Nur den Linux-Server-Ordner aus Git laden

Der Linux-Server liegt im GitHub-Repository im Ordner:

```text
server_linux
```

Repository:

```text
https://github.com/freakyy55/wwebjs-Server-und-Android-App
```

Wenn du nicht das komplette Projekt laden möchtest, kannst du nur den Ordner `server_linux` herunterladen.

---

## Variante 1: Nur `server_linux` mit Git laden

```bash
git clone --filter=blob:none --no-checkout https://github.com/freakyy55/wwebjs-Server-und-Android-App.git OwnMessenger-Linux-Server
cd OwnMessenger-Linux-Server
git sparse-checkout init --cone
git sparse-checkout set server_linux
git checkout main
```

Danach befindet sich der Linux-Server-Ordner hier:

```bash
cd server_linux
```

---

## Variante 2: Komplettes Repository laden

Alternativ kannst du auch das komplette Repository klonen:

```bash
git clone https://github.com/freakyy55/wwebjs-Server-und-Android-App.git OwnMessenger-Linux-Server
cd OwnMessenger-Linux-Server/server_linux
```

---

## Kurzfassung

Im Linux-Server-Ordner ausführen:

```bash
chmod +x install.sh
./install.sh
```

Dann im Menü auswählen:

```text
1) Alles installieren/vorbereiten und Server dauerhaft starten
```

Das Script aktualisiert Paketlisten, installiert benötigte Pakete, erstellt die `.env`, erzeugt bei Bedarf einen App-Key, führt `npm install` aus, erstellt einen eigenen Systembenutzer, richtet den systemd-Autostart ein und startet danach den Server.

---

## Was `install.sh` macht

`install.sh` übernimmt unter Linux die wichtigsten Schritte automatisch.

Je nach System werden installiert oder geprüft:

```text
Systemupdates
Node.js
npm
Chromium oder Google Chrome
ffmpeg
ClamAV / clamscan
Git
rsync
Build-Tools
npm-Pakete
Server-Konfiguration
benötigte Ordner
App-Key
Systembenutzer ownmessenger
Installationsordner /opt/ownmessenger/server_linux
systemd-Service ownmessenger
Autostart nach Server-Neustart
```

---

## Eigener Benutzer statt root

Aus Sicherheitsgründen soll der Node.js-Server nicht als `root` laufen.

Die neue `install.sh` erstellt deshalb automatisch:

```text
Benutzer: ownmessenger
Gruppe:   ownmessenger
Home:     /opt/ownmessenger
```

Der Server wird nach hier kopiert:

```text
/opt/ownmessenger/server_linux
```

Die Rechte werden passend gesetzt:

```text
ownmessenger:ownmessenger
```

Der systemd-Service startet Node.js dann mit:

```ini
User=ownmessenger
Group=ownmessenger
WorkingDirectory=/opt/ownmessenger/server_linux
```

Dadurch läuft der Server nicht als `root`.

---

## Server installieren und starten

Im Git-Ordner ausführen:

```bash
cd ~/OwnMessenger-Linux-Server/server_linux
chmod +x install.sh
./install.sh
```

Im Menü:

```text
1) Alles installieren/vorbereiten und Server dauerhaft starten
```

Beim ersten Start kann die Installation einige Minuten dauern.

Nach der Einrichtung läuft der Server über `systemd` weiter, auch wenn die Konsole geschlossen wird.

Der Server startet außerdem nach einem Server-Neustart automatisch wieder.

---

## Prüfen, ob Node.js nicht als root läuft

Status anzeigen:

```bash
systemctl status ownmessenger
```

Prüfen, unter welchem Benutzer Node.js läuft:

```bash
ps -eo user,pid,cmd | grep node
```

Richtig ist zum Beispiel:

```text
ownmessenger   1234 node ...
```

Nicht richtig wäre:

```text
root           1234 node ...
```

---

## Server verwalten

Status anzeigen:

```bash
systemctl status ownmessenger
```

Live-Logs anzeigen:

```bash
journalctl -u ownmessenger -f
```

Server neu starten:

```bash
systemctl restart ownmessenger
```

Server stoppen:

```bash
systemctl stop ownmessenger
```

Server starten:

```bash
systemctl start ownmessenger
```

Autostart aktivieren:

```bash
systemctl enable ownmessenger
```

Autostart deaktivieren:

```bash
systemctl disable ownmessenger
```

---

## Aus Git aktualisieren

Wenn der Server später aktualisiert werden soll, im Git-Ordner ausführen:

```bash
cd ~/OwnMessenger-Linux-Server/server_linux
./install.sh --git-update
```

Das Script lädt dann die neue Version aus Git, kopiert sie nach:

```text
/opt/ownmessenger/server_linux
```

Danach werden die npm-Abhängigkeiten aktualisiert und der systemd-Service neu gestartet.

---

## HTTPS ist erforderlich

Die Android-App sollte mit einer HTTPS-Adresse verbunden werden.

Beispiel:

```text
https://messenger.deine-domain.example
```

Ein lokaler HTTP-Link ist für Tests manchmal möglich, für normale Nutzung aber nicht empfohlen.

Empfohlene Möglichkeiten für HTTPS:

```text
Cloudflare Tunnel
Caddy Reverse Proxy
Nginx Reverse Proxy
Traefik
eigene Domain mit Zertifikat
```

Beispiel:

```text
https://messenger.deine-domain.example -> http://127.0.0.1:3000
```

---

## App-Key

Der App-Key wird in der Datei `.env` gespeichert.

Nach der Installation liegt die aktive `.env` hier:

```text
/opt/ownmessenger/server_linux/.env
```

Beispiel:

```env
APP_TOKEN=dein-sicherer-key
```

Wenn `APP_TOKEN` leer ist, erzeugt `install.sh` automatisch einen sicheren Key.

Diesen Key musst du in der Android-App eintragen.

App-Key anzeigen:

```bash
./install.sh --key
```

Oder im Menü:

```text
7) App-Key anzeigen
```

---

## Bis zu 5 WhatsApp-Nummern

Über einen Server können bis zu **5 WhatsApp-Nummern / Accounts** laufen.

Wichtig:

```text
jede Nummer braucht eine eigene WhatsApp-Web-Sitzung
jede Nummer muss per QR-Code verbunden werden
Sitzungsdaten sollten nicht gelöscht werden
die Android-App verbindet sich mit dem Server, nicht direkt mit WhatsApp
```

---

## WhatsApp verbinden

Beim ersten Start zeigt der Server einen QR-Code an.

Diesen mit WhatsApp scannen:

```text
WhatsApp öffnen
-> Einstellungen
-> Verknüpfte Geräte
-> Gerät verknüpfen
-> QR-Code scannen
```

---

## Medien, Metadaten und Virenprüfung

Der Server kann Medien wie Bilder, Videos, Audiodateien und Dokumente verarbeiten.

Je nach Konfiguration kann der Server:

```text
Metadaten von Bildern und Dateien anpassen oder entfernen
Dateien für die Android-App vorbereiten
Bilder neu encodieren
Audio/Video mit ffmpeg neu encodieren
Dateien mit ClamAV prüfen
unsichere Dateien blockieren
```

Die Virenprüfung ist eine zusätzliche Schutzmaßnahme und ersetzt keine vollständige Sicherheitslösung.

---

## Android-App verbinden

In der Android-App eintragen:

```text
Server-URL: https://messenger.deine-domain.example
App-Key:    derselbe Key aus APP_TOKEN
```

Danach in der App:

```text
Server speichern
Neu verbinden
```

Wenn alles passt, sollte der Status auf `live` stehen.

---

## Häufige Probleme

### Git ist nicht installiert

Fehlerbeispiel:

```text
git: command not found
```

Lösung:

```bash
sudo apt-get update
sudo apt-get install -y git
```

Als `root`:

```bash
apt-get update
apt-get install -y git
```

Danach erneut versuchen:

```bash
git --version
```

---

### Falscher Paketname bei Git

Fehlerbeispiel:

```text
E: Paket gitt kann nicht gefunden werden.
```

Richtig ist:

```bash
apt-get install -y git
```

Nicht:

```bash
apt-get install -y gitt
```

---

### GitHub kann nicht erreicht werden

Fehlerbeispiel:

```text
Could not resolve host: github.com
```

Dann DNS/Internet prüfen:

```bash
ping -c 3 1.1.1.1
ping -c 3 github.com
```

Falls `github.com` nicht aufgelöst wird, DNS setzen:

```bash
printf "nameserver 1.1.1.1\nnameserver 8.8.8.8\n" | sudo tee /etc/resolv.conf
```

Als `root`:

```bash
printf "nameserver 1.1.1.1\nnameserver 8.8.8.8\n" > /etc/resolv.conf
```

Danach erneut prüfen:

```bash
ping -c 3 github.com
```

---

### Node.js ist zu alt

Prüfen:

```bash
node -v
```

Benötigt wird Node.js 18 oder neuer.

`install.sh` versucht auf Ubuntu/Debian automatisch Node.js 20 LTS über NodeSource zu installieren, falls die vorhandene Version zu alt ist.

---

### npm fehlt

Fehlerbeispiel:

```text
npm: Kommando nicht gefunden
```

Lösung:

```bash
sudo apt-get update
sudo apt-get install -y npm
```

Als `root`:

```bash
apt-get update
apt-get install -y npm
```

Danach prüfen:

```bash
npm -v
```

Die neue `install.sh` versucht `npm` automatisch nachzuinstallieren, falls es fehlt.

---

### Chromium startet nicht

Zusätzliche Pakete installieren:

```bash
sudo apt-get update
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 fonts-liberation
```

Als `root`:

```bash
apt-get update
apt-get install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 fonts-liberation
```

---

### ClamAV funktioniert nicht

Prüfen:

```bash
which clamscan
clamscan --version
```

Virensignaturen aktualisieren:

```bash
sudo freshclam
```

Als `root`:

```bash
freshclam
```

---

### Service startet nicht

Status anzeigen:

```bash
systemctl status ownmessenger
```

Logs anzeigen:

```bash
journalctl -u ownmessenger -n 100 --no-pager
```

Live-Logs anzeigen:

```bash
journalctl -u ownmessenger -f
```

---

### Node.js läuft doch als root

Prüfen:

```bash
ps -eo user,pid,cmd | grep node
```

Wenn dort `root` steht, Service neu erstellen:

```bash
cd ~/OwnMessenger-Linux-Server/server_linux
./install.sh
```

Danach im Menü auswählen:

```text
1) Alles installieren/vorbereiten und Server dauerhaft starten
```

Dann erneut prüfen:

```bash
ps -eo user,pid,cmd | grep node
```

---

### App verbindet sich nicht

Prüfen:

```text
Server läuft
HTTPS-Adresse funktioniert
App-Key stimmt
Reverse Proxy leitet auf Port 3000 weiter
Firewall lässt Verbindung zu
```

---

## Hinweis

Diese Linux-Anleitung bezieht sich nur auf den Ordner:

```text
server_linux
```

Unter Windows kann weiterhin das `CONTROL_PANEL_WINDOWS` genutzt werden.
