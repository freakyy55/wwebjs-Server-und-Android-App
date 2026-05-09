/*
  wwebjs connection test only.
  - Starts whatsapp-web.js Client
  - Shows QR code in terminal
  - Waits for authenticated/ready
  - Prints getState() and WhatsApp Web version
  - Does NOT read chats, messages, contacts, or send messages.
*/
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const authDir = path.join(__dirname, '..', '.wwebjs_auth');

function line() {
  console.log('='.repeat(64));
}

function info(message) {
  console.log(`[INFO] ${message}`);
}

function ok(message) {
  console.log(`[OK] ${message}`);
}

function warn(message) {
  console.log(`[WARN] ${message}`);
}

function fail(message) {
  console.error(`[FEHLER] ${message}`);
}

line();
console.log('Own Messenger Server - whatsapp-web.js Verbindungstest');
line();
info('Dieser Test prueft nur Login/Verbindung.');
info('Es werden keine Chats ausgelesen und keine Nachrichten gesendet.');
info(`Session-Ordner: ${authDir}`);
console.log('');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'connection-test',
    dataPath: authDir,
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
});

let ready = false;
let sawQr = false;

client.on('qr', (qr) => {
  sawQr = true;
  line();
  console.log('QR-Code scannen:');
  line();
  qrcode.generate(qr, { small: true });
  console.log('');
  info('WhatsApp auf dem Handy öffnen → Einstellungen → Verknüpfte Geräte → Gerät verknüpfen.');
  info('Der QR-Code kann sich erneuern, solange er nicht gescannt wurde.');
});

client.on('authenticated', () => {
  ok('Authentifiziert.');
});

client.once('ready', async () => {
  ready = true;
  line();
  ok('Client is ready! Verbindungstest erfolgreich.');

  try {
    const state = await client.getState();
    ok(`getState(): ${state}`);
  } catch (error) {
    warn(`getState() konnte nicht gelesen werden: ${error.message}`);
  }

  try {
    const version = await client.getWWebVersion();
    ok(`WhatsApp Web Version: ${version}`);
  } catch (error) {
    warn(`WhatsApp-Web-Version konnte nicht gelesen werden: ${error.message}`);
  }

  console.log('');
  info('Dieses Fenster offen lassen, wenn die Session aktiv bleiben soll.');
  info('Beenden mit STRG+C. Beim nächsten Start wird die gespeicherte Session wiederverwendet.');
  line();
});

client.on('auth_failure', (message) => {
  fail(`Authentifizierung fehlgeschlagen: ${message}`);
});

client.on('disconnected', (reason) => {
  warn(`Client getrennt: ${reason}`);
});

process.on('SIGINT', async () => {
  console.log('');
  info('Beende Verbindungstest...');
  try {
    await client.destroy();
  } catch (_) {
    // ignore
  }
  process.exit(0);
});

setTimeout(() => {
  if (!ready) {
    if (sawQr) {
      warn('Noch nicht bereit. QR wurde angezeigt, aber noch nicht erfolgreich verbunden.');
    } else {
      warn('Noch nicht bereit und bisher kein QR empfangen. Prüfe Internet/Firewall/Puppeteer.');
    }
    info('Der Test läuft weiter. Beenden mit STRG+C.');
  }
}, 120000);

client.initialize().catch((error) => {
  fail(error.stack || error.message || String(error));
  process.exitCode = 1;
});

// Keep Node process alive after ready so the user can observe the state.
setInterval(() => {}, 1000 * 60 * 60);
