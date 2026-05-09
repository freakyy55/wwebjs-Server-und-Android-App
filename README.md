# OwnMessenger

OwnMessenger ist eine deutsche Android-App mit eigener Server-Bridge auf Basis von [whatsapp-web.js](https://wwebjs.dev/).

Die App verbindet sich per WebSocket mit deinem eigenen Server und stellt eine mobile Chat-Oberfläche für Nachrichten, Medien, Sprachnachrichten, Anruflisten und lokale Push-Benachrichtigungen bereit.

---

## Projektbestandteile

```text
android/                 Android-App
server/                  OwnMessenger-Server auf Basis von whatsapp-web.js
CONTROL_PANEL_WINDOWS/   Windows-Control-Panel zum einfachen Starten
```

---

## Funktionen

- deutsche Android-App
- Live-Synchronisierung per WebSocket
- Chatliste mit neuesten Nachrichten
- Textnachrichten senden und empfangen
- Mediennachrichten anzeigen
- Sprachnachrichten aufnehmen
- Sprachnachrichten vor dem Senden anhören
- Nachrichten kopieren
- Nachrichten speichern oder teilen
- Nachrichten an andere Chats weiterleiten
- Anrufliste
- Anzeige entgangener Anrufe
- Kontakt-Profilbilder über Serverdaten
- eigenes Hintergrundbild für Chats
- lokale Push-Benachrichtigungen über Android-Foreground-Service
- automatischer Start des Push-Dienstes nach Geräteneustart
- Zugriffsschutz über App-Key
- Unterstützung für bis zu 5 WhatsApp-Nummern / Accounts pro Server
- dunkle Benutzeroberfläche

---

## Windows-Control-Panel

Für Windows gibt es ein eigenes Control Panel:

```text
CONTROL_PANEL_WINDOWS
```

Darüber kann der Server bequem gestartet werden.

Im Control Panel kann man zum Beispiel:

```text
Server starten
```

auswählen.

Beim Start prüft das Control Panel automatisch, ob benötigte Dateien und Abhängigkeiten vorhanden sind. Wenn etwas fehlt, wird es automatisch installiert beziehungsweise vorbereitet.

Dadurch muss der Server unter Windows nicht zwingend manuell über die Konsole eingerichtet werden.

---

## Server

Der Server basiert auf **whatsapp-web.js** und verbindet sich mit WhatsApp Web.

Er verwaltet die WhatsApp-Web-Sitzung, empfängt Nachrichten, Medien und Anrufereignisse und leitet diese an die Android-App weiter.

Beim ersten Start muss WhatsApp Web per QR-Code verbunden werden:

```text
WhatsApp öffnen
→ Einstellungen
→ Verknüpfte Geräte
→ Gerät verknüpfen
→ QR-Code scannen
```

---

## HTTPS und App-Key

Die Android-App sollte mit einer HTTPS-Adresse verbunden werden.

Beispiel:

```text
https://messenger.deine-domain.example
```

Der App-Key muss auf dem Server und in der Android-App gleich sein.

Beispiel in der Server-Konfiguration:

```env
APP_KEY=change-me
```

Derselbe Key muss in der Android-App eingetragen werden.

---

## Bis zu 5 Nummern pro Server

Über einen OwnMessenger-Server können bis zu **5 WhatsApp-Nummern / Accounts** laufen.

Jede Nummer benötigt eine eigene WhatsApp-Web-Sitzung auf dem Server.

Die Android-App verbindet sich nicht direkt mit WhatsApp, sondern mit dem eigenen OwnMessenger-Server.

---

## Medien, Metadaten und Virenprüfung

Der Server verarbeitet empfangene und gesendete Medien wie Bilder, Videos, Dokumente und andere Dateien.

Je nach Server-Konfiguration kann der Server Medien vor der Weitergabe an die Android-App verarbeiten.

Dazu gehören zum Beispiel:

```text
Metadaten von Bildern und Dateien anpassen oder entfernen
Dateiinformationen vereinheitlichen
Medien für die Android-App vorbereiten
Dateien vor der Weitergabe prüfen
ein Antivirenprogramm über Medien und Dateien laufen lassen
```

Diese Verarbeitung soll Datenschutz und Sicherheit verbessern.

Die Virenprüfung ist eine zusätzliche Schutzmaßnahme und ersetzt keine vollständige Sicherheitslösung auf dem Gerät oder Server.

---

## Profilbilder

Die App kann Kontakt-Profilbilder anzeigen, wenn der Server eines dieser Felder mitsendet:

```text
profilePicUrl
profile_pic_url
avatarUrl
avatar_url
```

Mit whatsapp-web.js können Profilbild-URLs zum Beispiel so abgefragt werden:

```js
const profilePicUrl = await contact.getProfilePicUrl();
```

Profilbilder sind nur verfügbar, wenn die Privatsphäre-Einstellungen des jeweiligen WhatsApp-Kontakts den Zugriff erlauben.

---

## Push-Benachrichtigungen

OwnMessenger Android nutzt einen Foreground-Service, um die WebSocket-Verbindung im Hintergrund aktiv zu halten.

Dadurch kann die App lokale Benachrichtigungen anzeigen für:

- neue Nachrichten
- entgangene Anrufe
- Anrufereignisse

Bei manchen Android-Geräten, besonders Xiaomi, Oppo, Vivo, Huawei oder ähnlichen Herstellern, müssen eventuell zusätzlich erlaubt werden:

- Autostart
- Hintergrundaktivität
- Akku-Optimierung für die App deaktivieren
- Benachrichtigungen erlauben

---

## Installation

Die ausführliche Windows-Installationsanleitung befindet sich in:

```text
OWNMESSENGER_WINDOWS_INSTALLATION.md
```

Dort wird beschrieben:

- Installation über `CONTROL_PANEL_WINDOWS`
- automatisches Installieren benötigter Abhängigkeiten
- manuelle Server-Installation als Alternative
- Android-App mit Android Studio bauen
- HTTPS-Adresse einrichten
- App-Key setzen
- mehrere Nummern verwenden
- Push-Benachrichtigungen aktivieren

---

## Sicherheit

Keine privaten Schlüssel, Tokens, Passwörter, echten App-Keys oder produktiven Server-Zugangsdaten in dieses Repository hochladen.

Empfohlene ignorierte Dateien:

```text
.env
local.properties
*.apk
*.aab
node_modules/
build/
.gradle/
app/build/
```

---

## Entwicklungsstand

OwnMessenger befindet sich aktuell in aktiver Entwicklung.

Aktueller Fokus:

- stabile WebSocket-Synchronisierung
- zuverlässige Push-Benachrichtigungen
- bessere Anruflisten-Unterstützung
- verbesserte Medienunterstützung
- einfache Einrichtung über Windows-Control-Panel
- bessere Unterstützung für mehrere WhatsApp-Accounts

---

## Lizenz

Dieses Projekt steht unter der Apache-2.0-Lizenz.

---

## Hinweis

Dieses Projekt steht in keiner Verbindung zu WhatsApp, Meta oder whatsapp-web.js.

WhatsApp ist eine Marke des jeweiligen Eigentümers.

Dieses Projekt nutzt whatsapp-web.js als technische Grundlage für die Verbindung zu WhatsApp Web.

Nutze dieses Projekt verantwortungsvoll und beachte die Nutzungsbedingungen aller beteiligten Plattformen.

---

## KI-Hinweis

Dieses Projekt entsteht mit Unterstützung moderner KI-Werkzeuge.

Idee, Tests, Anpassungen und Veröffentlichung erfolgen durch den Projektbetreiber. KI wird unterstützend für Code, Dokumentation, Fehlersuche und Weiterentwicklung verwendet.
