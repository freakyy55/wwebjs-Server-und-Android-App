# OwnMessenger Android v1.0.0

OwnMessenger Android ist eine Android-App für eine eigene OwnMessenger-Server-Bridge auf Basis von [whatsapp-web.js](https://wwebjs.dev/).

Die App verbindet sich per WebSocket mit deinem eigenen Server und stellt eine mobile Chat-Oberfläche für Nachrichten, Medien, Sprachnachrichten, Anruflisten und lokale Benachrichtigungen bereit.

## Funktionen

- Live-Synchronisierung per WebSocket mit dem OwnMessenger-Server
- Chatliste mit neuesten Nachrichten
- Textnachrichten senden und empfangen
- Unterstützung für Mediennachrichten
- Sprachnachrichten aufnehmen
- Sprachnachrichten vor dem Senden anhören, senden oder verwerfen
- Nachrichten kopieren, teilen, speichern und weiterleiten
- Anrufliste mit entgangenen Anrufen und Call-Log-Erkennung
- Kontakt-Profilbilder über Serverdaten
- eigenes Hintergrundbild für Chats
- lokale Push-Benachrichtigungen über Android-Foreground-Service
- automatischer Start des Push-Dienstes nach Geräteneustart
- Zugriffsschutz über App-Key
- feste Geräte-ID-Unterstützung
- dunkle Benutzeroberfläche

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

## Voraussetzungen

- Android-Gerät
- OwnMessenger-Server
- Backend auf Basis von whatsapp-web.js
- aktive WebSocket-Verbindung
- gültige Server-URL
- gültiger App-Key

## Einrichtung

1. Android-App installieren.
2. Einstellungen öffnen.
3. Server-URL eintragen.
4. App-Key eintragen.
5. Server speichern.
6. Benachrichtigungen aktivieren, wenn Push-Benachrichtigungen im Hintergrund genutzt werden sollen.

Beispiel für eine Server-URL:

```text
https://deine-domain.example
```

Oder zum lokalen Testen:

```text
http://192.168.178.100:3000
```

## Sicherheit

Keine privaten Schlüssel, Tokens, Passwörter oder echten Server-Zugangsdaten in dieses Repository hochladen.

## Version

Dies ist die erste stabile GitHub-Version: **v1.0.0**.

## Lizenz

Dieses Projekt steht unter der Apache-2.0-Lizenz.

## Hinweis

Dieses Projekt steht in keiner Verbindung zu WhatsApp, Meta oder whatsapp-web.js.

WhatsApp ist eine Marke des jeweiligen Eigentümers.

Nutze dieses Projekt verantwortungsvoll und beachte die Nutzungsbedingungen aller beteiligten Plattformen.
