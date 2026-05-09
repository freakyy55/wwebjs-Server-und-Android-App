# OwnMessenger Server v1.0.0

OwnMessenger Server ist eine eigene Server-Bridge auf Basis von [whatsapp-web.js](https://wwebjs.dev/).

Der Server verbindet sich mit WhatsApp Web, verwaltet die Sitzung und leitet Nachrichten, Medien, Anrufe und weitere Ereignisse an die Android-App weiter.

## Funktionen

- Verbindung zu WhatsApp Web über whatsapp-web.js
- REST-API für Android-App
- WebSocket-Live-Synchronisierung
- Textnachrichten senden und empfangen
- Medien senden und bereitstellen
- Anrufereignisse und Call-Logs erkennen
- entgangene Anrufe an die Android-App weitergeben
- Profilbilder über whatsapp-web.js abrufen, soweit erlaubt
- App-Key-Schutz für die Android-App
- feste Geräte-ID-Unterstützung
- Multi-Account-/Slot-Unterstützung
- HTTPS-/WSS-Betrieb über Caddy-Setup für Windows
- Windows-Startdatei und Kontrollpanel
- optionale Medienprüfung und Sicherheitsfunktionen

## Voraussetzungen

- Windows-Server oder Windows-PC
- Node.js 18 oder neuer
- npm
- WhatsApp-Konto
- Browser-/Chromium-Unterstützung für whatsapp-web.js
- Android-App OwnMessenger Android v1.0.0 oder neuer

## Schnellstart unter Windows

Im Server-Ordner ausführen:

```bat
START_SERVER_WINDOWS.bat
```

Die Startdatei richtet die benötigten Komponenten ein und startet den Server.

## Manuelle Installation

```bash
npm install
npm start
```

## Konfiguration

Die Konfiguration erfolgt über `.env`.

Nutze `.env.example` als Vorlage:

```bash
cp .env.example .env
```

Wichtige Werte:

```env
PORT=3000
APP_TOKEN=change-me
REQUIRE_HTTPS=1
```

Der App-Key muss auch in der Android-App eingetragen werden.

## HTTPS / WSS

Für die Nutzung über das Internet sollte der Server nur über HTTPS/WSS erreichbar sein.

Für öffentliche HTTPS-Nutzung müssen am Router oder in der Firewall offen sein:

- TCP 80
- TCP 443

Port 3000 sollte öffentlich nicht direkt offen sein, wenn HTTPS über Reverse Proxy genutzt wird.

## Profilbilder

Mit whatsapp-web.js können Profilbild-URLs über Kontakte abgefragt werden:

```js
const profilePicUrl = await contact.getProfilePicUrl();
```

Die Android-App kann diese Felder anzeigen:

```text
profilePicUrl
profile_pic_url
avatarUrl
avatar_url
```

Profilbilder sind nur verfügbar, wenn die WhatsApp-Privatsphäre-Einstellungen des Kontakts den Zugriff erlauben.

## Sicherheit

Keine echten Zugangsdaten, Tokens, App-Keys, Sessions oder `.env`-Dateien in GitHub hochladen.

Empfohlen:

```text
.env
node_modules/
logs/
*.log
```

## Version

Dies ist die erste stabile GitHub-Version: **v1.0.0**.

## Lizenz

Dieses Projekt steht unter der Apache-2.0-Lizenz.

## Hinweis

Dieses Projekt steht in keiner Verbindung zu WhatsApp, Meta oder whatsapp-web.js.

WhatsApp ist eine Marke des jeweiligen Eigentümers.

Nutze dieses Projekt verantwortungsvoll und beachte die Nutzungsbedingungen aller beteiligten Plattformen.
