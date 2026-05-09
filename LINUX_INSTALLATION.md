# Linux-Installation

Diese Anleitung beschreibt die Installation des OwnMessenger Servers unter Linux.

Empfohlen für:

Ubuntu
Debian

Andere Linux-Distributionen können funktionieren, müssen aber eventuell angepasst werden.

---

## Voraussetzung: Git installieren

Damit der Server aus GitHub geladen werden kann, muss Git installiert sein.

Auf Ubuntu/Debian ausführen:

sudo apt update
sudo apt install -y git

Danach prüfen:

git --version

Wenn eine Versionsnummer angezeigt wird, ist Git installiert.

---

## Nur den Linux-Server-Ordner aus Git laden

Der Linux-Server liegt im GitHub-Repository im Ordner:

server_linux

Repository:

https://github.com/freakyy55/wwebjs-Server-und-Android-App

Wenn du nicht das komplette Projekt laden möchtest, kannst du nur den Ordner server_linux herunterladen.

---

## Variante 1: Nur server_linux mit Git laden

git clone --filter=blob:none --no-checkout https://github.com/freakyy55/wwebjs-Server-und-Android-App.git OwnMessenger-Linux-Server
cd OwnMessenger-Linux-Server
git sparse-checkout init --cone
git sparse-checkout set server_linux
git checkout main

Danach befindet sich der Linux-Server-Ordner hier:

cd server_linux

---

## Variante 2: Komplettes Repository laden

Alternativ kannst du auch das komplette Repository klonen:

git clone https://github.com/freakyy55/wwebjs-Server-und-Android-App.git OwnMessenger-Linux-Server
cd OwnMessenger-Linux-Server/server_linux

---

## Kurzfassung

Im Linux-Server-Ordner ausführen:

cd server_linux
chmod +x install.sh
./install.sh

Dann im Menü auswählen:

1) Alles installieren/vorbereiten und Server dauerhaft starten

Das Script aktualisiert Paketlisten, installiert benötigte Pakete, erstellt die .env, erzeugt bei Bedarf einen App-Key, führt npm install aus, richtet den Autostart ein und startet danach den Server.

---

## Was install.sh macht

install.sh übernimmt unter Linux die wichtigsten Schritte automatisch.

Je nach System werden installiert oder geprüft:

Systemupdates
Node.js
npm
Chromium oder Google Chrome
ffmpeg
ClamAV / clamscan
Git
Build-Tools
npm-Pakete
Server-Konfiguration
benötigte Ordner
App-Key
systemd-Service
Autostart nach Server-Neustart

---

## Server starten

cd server_linux
chmod +x install.sh
./install.sh

Im Menü:

1) Alles installieren/vorbereiten und Server dauerhaft starten

Beim ersten Start kann die Installation einige Minuten dauern.

Nach der Einrichtung läuft der Server über systemd weiter, auch wenn die Konsole geschlossen wird.

Der Server startet außerdem nach einem Server-Neustart automatisch wieder.

---

## Server verwalten

Status anzeigen:

systemctl status ownmessenger

Live-Logs anzeigen:

journalctl -u ownmessenger -f

Server neu starten:

systemctl restart ownmessenger

Server stoppen:

systemctl stop ownmessenger

Server starten:

systemctl start ownmessenger

Autostart deaktivieren:

systemctl disable ownmessenger

---

## HTTPS ist erforderlich

Die Android-App sollte mit einer HTTPS-Adresse verbunden werden.

Beispiel:

https://messenger.deine-domain.example

Ein lokaler HTTP-Link ist für Tests manchmal möglich, für normale Nutzung aber nicht empfohlen.

Empfohlene Möglichkeiten für HTTPS:

Cloudflare Tunnel
Caddy Reverse Proxy
Nginx Reverse Proxy
Traefik
eigene Domain mit Zertifikat

Beispiel:

https://messenger.deine-domain.example -> http://127.0.0.1:3000

---

## App-Key

Der App-Key wird in der Datei .env gespeichert.

Beispiel:

APP_TOKEN=dein-sicherer-key

Wenn APP_TOKEN leer ist, erzeugt install.sh automatisch einen sicheren Key.

Diesen Key musst du in der Android-App eintragen.

App-Key anzeigen:

./install.sh --key

Oder im Menü:

7) App-Key anzeigen

---

## Bis zu 5 WhatsApp-Nummern

Über einen Server können bis zu 5 WhatsApp-Nummern / Accounts laufen.

Wichtig:

jede Nummer braucht eine eigene WhatsApp-Web-Sitzung
jede Nummer muss per QR-Code verbunden werden
Sitzungsdaten sollten nicht gelöscht werden
die Android-App verbindet sich mit dem Server, nicht direkt mit WhatsApp

---

## WhatsApp verbinden

Beim ersten Start zeigt der Server einen QR-Code an.

Diesen mit WhatsApp scannen:

WhatsApp öffnen
-> Einstellungen
-> Verknüpfte Geräte
-> Gerät verknüpfen
-> QR-Code scannen

---

## Medien, Metadaten und Virenprüfung

Der Server kann Medien wie Bilder, Videos, Audiodateien und Dokumente verarbeiten.

Je nach Konfiguration kann der Server:

Metadaten von Bildern und Dateien anpassen oder entfernen
Dateien für die Android-App vorbereiten
Bilder neu encodieren
Audio/Video mit ffmpeg neu encodieren
Dateien mit ClamAV prüfen
unsichere Dateien blockieren

Die Virenprüfung ist eine zusätzliche Schutzmaßnahme und ersetzt keine vollständige Sicherheitslösung.

---

## Android-App verbinden

In der Android-App eintragen:

Server-URL: https://messenger.deine-domain.example
App-Key:    derselbe Key aus APP_TOKEN

Danach in der App:

Server speichern
Neu verbinden

Wenn alles passt, sollte der Status auf live stehen.

---

## Häufige Probleme

### Git ist nicht installiert

Fehlerbeispiel:

git: command not found

Lösung:

sudo apt update
sudo apt install -y git

Danach erneut versuchen:

git --version

---

### GitHub kann nicht erreicht werden

Fehlerbeispiel:

Could not resolve host: github.com

Dann DNS/Internet prüfen:

ping -c 3 1.1.1.1
ping -c 3 github.com

Falls github.com nicht aufgelöst wird, DNS setzen:

printf "nameserver 1.1.1.1\nnameserver 8.8.8.8\n" | sudo tee /etc/resolv.conf

Danach erneut prüfen:

ping -c 3 github.com

---

### Node.js ist zu alt

Prüfen:

node -v

Benötigt wird Node.js 18 oder neuer.

install.sh versucht auf Ubuntu/Debian automatisch Node.js 20 LTS über NodeSource zu installieren, falls die vorhandene Version zu alt ist.

---

### npm fehlt

Fehlerbeispiel:

npm: Kommando nicht gefunden

Lösung:

sudo apt update
sudo apt install -y npm

Danach prüfen:

npm -v

Die neue install.sh versucht npm automatisch nachzuinstallieren, falls es fehlt.

---

### Chromium startet nicht

Zusätzliche Pakete installieren:

sudo apt update
sudo apt install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 fonts-liberation

---

### ClamAV funktioniert nicht

Prüfen:

which clamscan
clamscan --version

Virensignaturen aktualisieren:

sudo freshclam

---

### App verbindet sich nicht

Prüfen:

Server läuft
HTTPS-Adresse funktioniert
App-Key stimmt
Reverse Proxy leitet auf Port 3000 weiter
Firewall lässt Verbindung zu

---

## Hinweis

Diese Linux-Anleitung bezieht sich nur auf den Ordner:

server_linux

Unter Windows kann weiterhin das CONTROL_PANEL_WINDOWS genutzt werden.
