# OwnMessenger Windows-Installation

Diese Anleitung beschreibt die Installation von **OwnMessenger Server** und **OwnMessenger Android** unter Windows.

Das Projekt besteht aus zwei Teilen und einem Windows-Control-Panel:

```text
server/                  OwnMessenger-Server auf Basis von whatsapp-web.js
android/                 Android-App
CONTROL_PANEL_WINDOWS/   Windows-Control-Panel zum einfachen Starten
```

---

## Kurzfassung

Unter Windows ist die einfachste Variante das **CONTROL_PANEL_WINDOWS**.

Damit kannst du den Server über eine Oberfläche starten. Wenn benötigte Dateien oder Abhängigkeiten fehlen, werden diese automatisch installiert beziehungsweise vorbereitet.

```text
CONTROL_PANEL_WINDOWS starten
→ Server starten auswählen
→ warten, bis alles installiert und gestartet wurde
→ QR-Code mit WhatsApp scannen
→ Android-App verbinden
```

---

## Voraussetzungen

### Für den Server

- Windows 10 oder Windows 11
- Internetverbindung
- WhatsApp auf dem Smartphone
- Google Chrome oder Chromium
- HTTPS-Adresse für die Verbindung aus der Android-App

Das Control Panel kann benötigte Server-Abhängigkeiten automatisch installieren, wenn sie fehlen.

### Für die Android-App

- Android Studio
- Android SDK
- Android-Gerät oder Emulator
- USB-Debugging, wenn die App direkt aus Android Studio gestartet werden soll

---

# Wichtig: HTTPS, App-Key und mehrere Nummern

## HTTPS ist erforderlich

Die Server-URL, die in der Android-App eingetragen wird, sollte mit **https://** beginnen.

Beispiel:

```text
https://messenger.deine-domain.example
```

Für normale Nutzung sollte kein HTTP-Link verwendet werden:

```text
http://deine-domain.example
```

Für lokale Tests kann HTTP je nach Android-Konfiguration funktionieren, empfohlen ist aber eine HTTPS-Adresse.

## App-Key

Die Android-App verbindet sich nur mit dem Server, wenn der eingetragene **App-Key** mit dem App-Key des Servers übereinstimmt.

Der App-Key wird auf dem Server in der `.env` gesetzt.

Beispiel:

```env
APP_KEY=change-me
```

In der Android-App muss derselbe Key eingetragen werden.

## Bis zu 5 Nummern pro Server

Über einen OwnMessenger-Server können bis zu **5 WhatsApp-Nummern / Accounts** laufen.

Jede Nummer benötigt eine eigene WhatsApp-Web-Sitzung auf dem Server.

---

# Medien, Metadaten und Virenprüfung

Der Server verarbeitet empfangene und gesendete Medien wie Bilder, Videos, Dokumente und andere Dateien.

Dabei können Medien vor der Weitergabe an die Android-App verarbeitet werden.

Je nach Server-Konfiguration kann der Server zum Beispiel:

```text
Metadaten von Bildern und Dateien anpassen oder entfernen
Dateiinformationen vereinheitlichen
Medien für die Android-App vorbereiten
Dateien vor der Weitergabe prüfen
ein Antivirenprogramm über Medien und Dateien laufen lassen
```

Diese Verarbeitung soll Datenschutz und Sicherheit verbessern.

Wichtig: Die Virenprüfung ersetzt keine vollständige Sicherheitslösung auf dem Gerät oder Server. Sie ist eine zusätzliche Schutzmaßnahme.

---

# Repository herunterladen

```powershell
git clone https://github.com/freakyy55/wwebjs-Server-und-Android-App.git
cd wwebjs-Server-und-Android-App
```

Alternativ kann das Repository über **GitHub Desktop** heruntergeladen werden.

---

# Empfohlene Installation über CONTROL_PANEL_WINDOWS

## 1. Control Panel öffnen

Im Projektordner den Ordner öffnen:

```text
CONTROL_PANEL_WINDOWS
```

Dort das Control Panel starten.

Je nach Projektdatei kann das zum Beispiel eine `.exe`, `.bat` oder `.cmd` sein.

## 2. Server starten

Im Control Panel die Funktion auswählen:

```text
Server starten
```

Danach prüft das Control Panel automatisch, ob alles vorhanden ist, was der Server braucht.

Falls etwas fehlt, wird es automatisch installiert oder vorbereitet.

Dazu gehören je nach Projektstand zum Beispiel:

```text
Node.js-Abhängigkeiten
npm-Pakete
Server-Konfiguration
benötigte Ordner
Sitzungsdaten für WhatsApp-Web
```

## 3. Warten, bis der Server läuft

Während des Starts kann die Installation einige Minuten dauern.

Das ist besonders beim ersten Start normal.

Wenn der Server fertig gestartet ist, bleibt das Control Panel beziehungsweise das Server-Fenster geöffnet.

Dieses Fenster sollte nicht geschlossen werden, solange der Server laufen soll.

## 4. WhatsApp verbinden

Beim ersten Start muss WhatsApp Web verbunden werden.

Falls ein QR-Code angezeigt wird:

```text
WhatsApp öffnen
→ Einstellungen
→ Verknüpfte Geräte
→ Gerät verknüpfen
→ QR-Code scannen
```

Nach erfolgreicher Verbindung kann der Server Nachrichten, Chats, Medien und Anrufe an die Android-App weitergeben.

---

# Manuelle Server-Installation

Falls das Control Panel nicht genutzt werden soll, kann der Server auch manuell gestartet werden.

## 1. In den Server-Ordner wechseln

```powershell
cd server
```

## 2. Abhängigkeiten installieren

```powershell
npm install
```

## 3. Konfigurationsdatei erstellen

Die Beispieldatei kopieren:

```powershell
Copy-Item .env.example .env
```

Danach die Datei `.env` bearbeiten.

Beispiel:

```env
PORT=3000
APP_KEY=change-me
```

`APP_KEY` sollte durch einen eigenen sicheren Schlüssel ersetzt werden.

## 4. Server starten

```powershell
npm start
```

---

# HTTPS einrichten

Für die Nutzung mit der Android-App wird eine HTTPS-Adresse empfohlen beziehungsweise benötigt.

Möglichkeiten:

- eigene Domain mit HTTPS
- Reverse Proxy mit HTTPS, zum Beispiel Nginx, Caddy oder Traefik
- Cloudflare Tunnel
- anderer HTTPS-Tunnel für Tests

Die URL, die später in die App eingetragen wird, muss mit `https://` beginnen.

Beispiel:

```text
https://messenger.deine-domain.example
```

Wenn der Server lokal auf Port 3000 läuft, kann ein Reverse Proxy die HTTPS-Adresse auf den lokalen Server weiterleiten.

Beispiel-Prinzip:

```text
https://messenger.deine-domain.example → http://127.0.0.1:3000
```

---

# Android-App bauen

## 1. Android Studio öffnen

Android Studio starten und diesen Ordner öffnen:

```text
wwebjs-Server-und-Android-App/android
```

Wichtig: Nicht den Hauptordner öffnen, sondern direkt den Ordner `android`.

## 2. Projekt synchronisieren

Nach dem Öffnen startet Android Studio normalerweise automatisch die Gradle-Synchronisierung.

Falls nicht:

```text
File → Sync Project with Gradle Files
```

## 3. APK bauen

In Android Studio:

```text
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

Nach dem Build zeigt Android Studio einen Hinweis an. Dort kann man auf **locate** klicken.

Die APK liegt normalerweise hier:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## 4. APK auf Android-Gerät installieren

Die APK auf das Android-Gerät kopieren und installieren.

Auf dem Android-Gerät muss eventuell erlaubt werden:

```text
Apps aus unbekannten Quellen installieren
```

Je nach Android-Version heißt diese Einstellung etwas anders.

---

# Android-App direkt aus Android Studio starten

Alternativ kann die App direkt aus Android Studio auf dem Handy gestartet werden.

## 1. USB-Debugging aktivieren

Auf dem Android-Gerät:

```text
Einstellungen → Über das Telefon → mehrfach auf Buildnummer tippen
```

Danach die Entwickleroptionen öffnen und aktivieren:

```text
USB-Debugging
```

## 2. Gerät verbinden

Android-Gerät per USB mit dem Windows-PC verbinden.

Falls auf dem Handy eine Nachfrage erscheint:

```text
USB-Debugging zulassen
```

bestätigen.

## 3. App starten

In Android Studio oben das Gerät auswählen und auf:

```text
Run
```

klicken.

---

# App einrichten

## 1. Server-URL eintragen

In der Android-App die Einstellungen öffnen und die Server-URL eintragen.

Die Server-URL sollte mit `https://` beginnen.

Beispiel:

```text
https://messenger.deine-domain.example
```

## 2. App-Key eintragen

In der App denselben App-Key eintragen, der in der `.env` des Servers steht.

Beispiel:

```text
change-me
```

## 3. Server speichern

In der App:

```text
Server speichern
```

antippen.

Danach:

```text
Neu verbinden
```

antippen.

Wenn alles passt, sollte der Status auf:

```text
live
```

stehen.

---

# Mehrere WhatsApp-Nummern verwenden

Der Server ist dafür gedacht, mehrere WhatsApp-Web-Sitzungen zu verwalten.

Aktuell können bis zu **5 Nummern / Accounts** über einen Server laufen.

Wichtig:

- jede Nummer muss einmal per QR-Code verbunden werden
- jede Nummer braucht eine eigene Sitzung auf dem Server
- Sitzungsdaten sollten nicht gelöscht werden
- die Android-App bekommt die Daten vom Server und muss nicht selbst mit WhatsApp verbunden werden

---

# Push-Benachrichtigungen

Die App nutzt einen Foreground-Service, damit die WebSocket-Verbindung im Hintergrund aktiv bleiben kann.

Damit Benachrichtigungen zuverlässig funktionieren, besonders auf Xiaomi, Oppo, Vivo, Huawei oder ähnlichen Geräten:

```text
Autostart erlauben
Akku-Optimierung deaktivieren
Hintergrundaktivität erlauben
Benachrichtigungen erlauben
```

Bei Xiaomi zum Beispiel:

```text
Einstellungen → Apps → Eigener Messenger → Autostart erlauben
Einstellungen → Akku → App-Akkuverbrauch → Keine Einschränkungen
```

Die genaue Bezeichnung kann je nach Android-Version abweichen.

---

# Windows-Firewall

Wenn die App den Server nicht erreicht, kann die Windows-Firewall blockieren.

Prüfen:

```text
Windows-Sicherheit → Firewall & Netzwerkschutz → App durch Firewall zulassen
```

Node.js muss im privaten Netzwerk erlaubt sein.

Alternativ beim ersten Start von Node.js die Firewall-Abfrage mit:

```text
Zugriff zulassen
```

bestätigen.

---

# Häufige Probleme

## App verbindet sich nicht

Prüfen:

```text
Server läuft
Server-URL beginnt mit https://
richtiger Port eingetragen
App-Key stimmt überein
Windows-Firewall blockiert Node.js nicht
Reverse Proxy oder HTTPS-Tunnel läuft
```

## Status bleibt offline

Prüfen:

```text
Server-Konsole zeigt Fehler?
WhatsApp Web ist verbunden?
QR-Code wurde gescannt?
WebSocket-Verbindung wird vom Server akzeptiert?
HTTPS-Zertifikat ist gültig?
```

## Nachrichten kommen nur bei geöffneter App

Auf dem Android-Gerät prüfen:

```text
Benachrichtigungen erlaubt
Autostart erlaubt
Akku-Optimierung deaktiviert
Foreground-Service läuft
```

## APK lässt sich nicht installieren

Prüfen:

```text
Installation aus unbekannten Quellen erlaubt
Android-Version kompatibel
alte App-Version ggf. vorher deinstallieren
```

## Server startet nicht

Empfohlen:

```text
CONTROL_PANEL_WINDOWS öffnen
Server starten auswählen
```

Alternativ manuell im Ordner `server` ausführen:

```powershell
npm install
npm start
```

Falls Chrome oder Chromium fehlt, installieren und danach erneut starten.

---

# Hinweis

Diese Anleitung ist aktuell hauptsächlich für Windows ausgelegt.

Linux- und macOS-Anleitungen können später ergänzt werden.
