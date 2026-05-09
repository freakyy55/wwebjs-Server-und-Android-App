# OwnMessenger Android

OwnMessenger Android ist eine schlanke Android-App für eine eigene OwnMessenger-Server-Bridge auf Basis von [whatsapp-web.js](https://wwebjs.dev/).

Die App verbindet sich per WebSocket mit deinem eigenen Server und stellt eine mobile Chat-Oberfläche für Nachrichten, Medien, Sprachnachrichten, Anruflisten und lokale Benachrichtigungen bereit.

## Funktionen

- Live-Synchronisierung per WebSocket mit dem OwnMessenger-Server
- Chatliste mit neuesten Nachrichten
- Textnachrichten senden und empfangen
- Unterstützung für Mediennachrichten
- Sprachnachrichten aufnehmen
- Sprachnachrichten vor dem Senden anhören
- Nachrichtenaktionen:
  - Nachricht kopieren
  - Nachricht speichern/teilen
  - Nachricht an einen anderen Chat weiterleiten
- Anrufliste
- Anzeige entgangener Anrufe
- Kontakt-Profilbilder über Serverdaten
- eigenes Hintergrundbild für Chats
- lokale Push-Benachrichtigungen über Android-Foreground-Service
- automatischer Start des Push-Dienstes nach einem Geräteneustart
- Zugriffsschutz über App-Key
- feste Geräte-ID-Unterstützung
- dunkle Benutzeroberfläche

## Server

Diese App ist für eine OwnMessenger-Server-Bridge mit whatsapp-web.js gedacht.

Der Server verbindet sich mit WhatsApp Web, verwaltet die Sitzung und leitet Nachrichten, Medien, Anrufe und weitere Ereignisse an die Android-App weiter.

Empfohlenes Server-Projekt:
