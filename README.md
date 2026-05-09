# wwebjs Server und Android App

OwnMessenger ist ein eigenes Messenger-Projekt mit Android-App und Server-Bridge auf Basis von [whatsapp-web.js](https://wwebjs.dev/).

Die Android-App verbindet sich per WebSocket mit dem eigenen Server. Der Server verbindet sich mit WhatsApp Web und leitet Nachrichten, Medien, Anrufe und weitere Ereignisse an die App weiter.

## Projektstruktur

```text
android/   Android-App
server/    OwnMessenger-Server auf Basis von whatsapp-web.js
```

## Funktionen

- Android-App mit Chatliste und Chatansicht
- WebSocket-Live-Synchronisierung
- Textnachrichten senden und empfangen
- Medienunterstützung
- Sprachnachrichten mit Vorschau vor dem Senden
- Nachrichten kopieren, teilen, speichern und weiterleiten
- Anrufliste und entgangene Anrufe
- Kontakt-Profilbilder über Serverdaten
- eigene Chat-Hintergründe
- lokale Push-Benachrichtigungen über Android-Foreground-Service
- OwnMessenger-Server mit whatsapp-web.js
- App-Key-Schutz und feste Geräte-ID
- HTTPS-/WSS-Unterstützung für den sicheren Betrieb

## Android-App

Die Android-App befindet sich im Ordner:

```text
android/
```

Weitere Informationen stehen in:

```text
android/README.md
```

## Server

Der Server befindet sich im Ordner:

```text
server/
```

Weitere Informationen stehen in:

```text
server/README.md
```

## Einrichtung

1. Server im Ordner `server/` einrichten und starten.
2. App-Key im Server festlegen.
3. Android-App installieren.
4. Server-URL und App-Key in der Android-App eintragen.
5. Benachrichtigungen aktivieren, wenn Push im Hintergrund genutzt werden soll.

## Sicherheit

Keine privaten Schlüssel, Tokens, Passwörter, Sessions oder `.env`-Dateien in dieses Repository hochladen.

## Version

Erste stabile GitHub-Version: **v1.0.0**

## Lizenz

Dieses Projekt steht unter der Apache-2.0-Lizenz.

## Hinweis

Dieses Projekt steht in keiner Verbindung zu WhatsApp, Meta oder whatsapp-web.js.

WhatsApp ist eine Marke des jeweiligen Eigentümers.

Nutze dieses Projekt verantwortungsvoll und beachte die Nutzungsbedingungen aller beteiligten Plattformen.
