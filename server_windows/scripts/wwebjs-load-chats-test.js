/*
  wwebjs chat + recent-message import test.

  What it does:
  - starts whatsapp-web.js Client
  - prints QR if no session exists
  - waits for ready
  - calls getChats()
  - optionally fetches recent messages per chat
  - writes wwebjs_chats_export.json and wwebjs_messages_export.json
  - imports chats/messages into the running OwnMessengerServer via /provider/chats and /provider/messages
  - if the server is not running, imports directly into SQLite as fallback

  It does NOT send messages.
*/

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_CHATS_FILE = path.join(PROJECT_ROOT, 'wwebjs_chats_export.json');
const OUTPUT_MESSAGES_FILE = path.join(PROJECT_ROOT, 'wwebjs_messages_export.json');
const SERVER_URL = process.env.SERVER_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const CHAT_LIMIT = Number(process.env.CHAT_LIMIT || 200);
const IMPORT_TO_SERVER = String(process.env.IMPORT_TO_SERVER || '1') !== '0';
const DIRECT_DB_FALLBACK = String(process.env.DIRECT_DB_FALLBACK || '1') !== '0';
const HEADLESS = String(process.env.WWEBJS_HEADLESS || '1') !== '0';
const CLIENT_ID = process.env.WWEBJS_CLIENT_ID || 'own-messenger-load-chats-test';
const FETCH_RECENT_MESSAGES = String(process.env.FETCH_RECENT_MESSAGES || '1') !== '0';
const MESSAGE_LIMIT_PER_CHAT = Number(process.env.MESSAGE_LIMIT_PER_CHAT || 15);
const MESSAGE_CHAT_LIMIT = Number(process.env.MESSAGE_CHAT_LIMIT || 75);

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTimestamp(value) {
  const n = toNumber(value, Math.floor(Date.now() / 1000));
  return n > 100_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

function bodyPreviewForType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'image') return '[Bild]';
  if (t === 'video') return '[Video]';
  if (t === 'audio' || t === 'ptt') return '[Audio]';
  if (t === 'document') return '[Dokument]';
  if (t === 'sticker') return '[Sticker]';
  if (t === 'location') return '[Standort]';
  if (t) return `[${t}]`;
  return '';
}

function lastMessagePreview(chat) {
  const msg = chat.lastMessage || chat._data?.lastMessage || null;
  if (!msg) return '';
  const body = msg.body || msg.caption || msg.text || msg._data?.body || '';
  if (body) return String(body).slice(0, 240);
  return bodyPreviewForType(msg.type || msg._data?.type);
}

function serializeChat(chat) {
  const id = chat.id?._serialized || chat.id?.user || String(chat.id || '');
  return {
    id,
    chatId: id,
    name: chat.name || chat.formattedTitle || chat.contact?.pushname || id,
    isGroup: Boolean(chat.isGroup || id.endsWith('@g.us')),
    unreadCount: Number(chat.unreadCount || 0),
    timestamp: normalizeTimestamp(chat.timestamp || chat.t || chat._data?.t || Date.now()),
    lastTimestamp: normalizeTimestamp(chat.timestamp || chat.t || chat._data?.t || Date.now()),
    lastMessage: lastMessagePreview(chat),
    archived: Boolean(chat.archived || chat._data?.archive),
    pinned: Boolean(chat.pinned || chat._data?.pin),
    muted: Boolean(chat.isMuted || chat._data?.isMuted),
    muteExpiration: chat.muteExpiration || chat._data?.muteExpiration || 0,
    rawType: chat.constructor?.name || 'Chat'
  };
}

function messageBody(message) {
  const body = message.body || message.caption || message._data?.body || message._data?.caption || '';
  if (body) return String(body);
  return bodyPreviewForType(message.type || message._data?.type);
}

function serializeMessage(message, fallbackChatId) {
  const id = message.id?._serialized || message.id?.id || message._data?.id?._serialized || `msg_${Date.now()}_${Math.random()}`;
  const fromMe = Boolean(message.fromMe || message._data?.id?.fromMe);
  const chatId = fallbackChatId || message.to || message.from || message.id?.remote || message._data?.id?.remote || '';
  const type = String(message.type || message._data?.type || 'text').toLowerCase();
  return {
    id,
    messageId: id,
    providerMessageId: id,
    waMessageId: id,
    chatId,
    chat_id: chatId,
    from: message.from,
    to: message.to,
    fromMe,
    direction: fromMe ? 'out' : 'in',
    name: fromMe ? 'Ich' : (message._data?.notifyName || message.author || message.from || chatId),
    senderName: fromMe ? 'Ich' : (message._data?.notifyName || message.author || message.from || chatId),
    body: messageBody(message),
    text: messageBody(message),
    type,
    timestamp: normalizeTimestamp(message.timestamp || message._data?.t || Date.now()),
    status: fromMe ? `ack_${message.ack ?? 0}` : 'received',
    hasMedia: Boolean(message.hasMedia),
    rawType: message.constructor?.name || 'Message'
  };
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({ raw: 'non-json response' }));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function directDbImport(chats, messages) {
  const db = require('../src/db');
  db.migrate();
  const savedChats = chats.map((chat) => db.upsertChat({
    id: chat.id,
    name: chat.name,
    lastMessage: chat.lastMessage,
    lastTimestamp: chat.lastTimestamp,
    unreadCount: chat.unreadCount,
    isGroup: chat.isGroup,
    muted: chat.muted,
    pinned: chat.pinned,
    archived: chat.archived
  }));

  const savedMessages = [];
  for (const message of messages) {
    try {
      savedMessages.push(db.insertMessage(message));
    } catch (error) {
      console.log(`[WARN] Nachricht konnte nicht importiert werden (${message.id}): ${error.message}`);
    }
  }
  return { savedChats, savedMessages };
}

async function fetchRecentMessagesForChats(chatsRaw, serializedChats) {
  if (!FETCH_RECENT_MESSAGES || MESSAGE_LIMIT_PER_CHAT <= 0) return [];

  const messages = [];
  const byId = new Map(serializedChats.map((chat) => [chat.id, chat]));
  const limited = chatsRaw.slice(0, Math.min(MESSAGE_CHAT_LIMIT, chatsRaw.length));

  console.log(`[2/4] Lade bis zu ${MESSAGE_LIMIT_PER_CHAT} aktuelle Nachrichten aus ${limited.length} Chats ...`);

  let index = 0;
  for (const chat of limited) {
    index += 1;
    const serialized = serializeChat(chat);
    const chatLabel = (serialized.name || serialized.id || '').slice(0, 60);
    try {
      const recent = await chat.fetchMessages({ limit: MESSAGE_LIMIT_PER_CHAT });
      const serializedMessages = recent.map((message) => serializeMessage(message, serialized.id));
      messages.push(...serializedMessages);

      const last = serializedMessages[serializedMessages.length - 1];
      if (last && byId.has(serialized.id)) {
        byId.get(serialized.id).lastMessage = last.body || byId.get(serialized.id).lastMessage;
        byId.get(serialized.id).lastTimestamp = last.timestamp || byId.get(serialized.id).lastTimestamp;
      }

      console.log(`  [${index}/${limited.length}] ${chatLabel}: ${serializedMessages.length} Nachrichten`);
    } catch (error) {
      console.log(`  [${index}/${limited.length}] ${chatLabel}: FEHLER ${error.message}`);
    }
  }

  return messages;
}

async function main() {
  console.log('============================================================');
  console.log(' Own Messenger Server - wwebjs Chat Import in App-DB');
  console.log('============================================================');
  console.log('Dieser Test lädt Chatliste + aktuelle Nachrichten und importiert sie in deine App-DB.');
  console.log('Es werden keine Nachrichten gesendet.');
  console.log(`Server Import URL   : ${SERVER_URL}/provider/chats`);
  console.log(`Chat Export Datei   : ${OUTPUT_CHATS_FILE}`);
  console.log(`Message Export Datei: ${OUTPUT_MESSAGES_FILE}`);
  console.log(`Client-ID           : ${CLIENT_ID}`);
  console.log(`Chat-Limit          : ${CHAT_LIMIT}`);
  console.log(`Nachrichten/Chat    : ${FETCH_RECENT_MESSAGES ? MESSAGE_LIMIT_PER_CHAT : 0}`);
  console.log('');

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: CLIENT_ID,
      dataPath: path.join(PROJECT_ROOT, '.wwebjs_auth')
    }),
    puppeteer: {
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', (qr) => {
    console.log('\n[QR] QR-Code scannen:');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('[OK] authenticated'));
  client.on('auth_failure', (message) => console.log('[FEHLER] auth_failure:', message));
  client.on('disconnected', (reason) => console.log('[INFO] disconnected:', reason));

  client.once('ready', async () => {
    try {
      console.log('[OK] ready');
      const state = await client.getState().catch((error) => `STATE_ERROR: ${error.message}`);
      console.log(`[OK] getState(): ${state}`);

      const version = await client.getWWebVersion().catch(() => null);
      if (version) console.log(`[OK] WhatsApp Web Version: ${version}`);

      console.log('[1/4] Lade Chats mit client.getChats() ...');
      const chatsRaw = await client.getChats();
      const selectedRaw = chatsRaw
        .sort((a, b) => ((b.pinned || 0) - (a.pinned || 0)) || (normalizeTimestamp(b.timestamp || b.t || b._data?.t) - normalizeTimestamp(a.timestamp || a.t || a._data?.t)))
        .slice(0, CHAT_LIMIT);

      const chats = selectedRaw.map(serializeChat);
      const messages = await fetchRecentMessagesForChats(selectedRaw, chats);

      chats.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.lastTimestamp - a.lastTimestamp));

      fs.writeFileSync(OUTPUT_CHATS_FILE, JSON.stringify({ exportedAt: new Date().toISOString(), count: chats.length, chats }, null, 2), 'utf8');
      fs.writeFileSync(OUTPUT_MESSAGES_FILE, JSON.stringify({ exportedAt: new Date().toISOString(), count: messages.length, messages }, null, 2), 'utf8');

      console.log(`[OK] ${chats.length} Chats geladen.`);
      console.log(`[OK] ${messages.length} Nachrichten geladen.`);
      console.log('');
      console.log('Erste Chats:');
      for (const chat of chats.slice(0, 20)) {
        const unread = chat.unreadCount ? ` unread=${chat.unreadCount}` : '';
        const group = chat.isGroup ? ' group' : '';
        const flags = `${chat.pinned ? ' pinned' : ''}${chat.archived ? ' archived' : ''}${chat.muted ? ' muted' : ''}`;
        console.log(`- ${chat.name} <${chat.id}>${group}${unread}${flags}`);
        if (chat.lastMessage) console.log(`  ${chat.lastMessage}`);
      }

      let importedViaServer = false;
      if (IMPORT_TO_SERVER) {
        console.log('');
        console.log('[3/4] Importiere Chatliste in laufenden OwnMessengerServer ...');
        try {
          const chatResult = await postJson(`${SERVER_URL}/provider/chats`, { source: 'wwebjs-import', chats });
          console.log(`[OK] Server-Chat-Import erfolgreich: ${chatResult.count} Chats.`);

          if (messages.length) {
            const msgResult = await postJson(`${SERVER_URL}/provider/messages`, { source: 'wwebjs-import', messages });
            console.log(`[OK] Server-Nachrichten-Import erfolgreich: ${msgResult.data?.length || messages.length} Nachrichten.`);
          }
          importedViaServer = true;
        } catch (error) {
          console.log(`[WARN] Server-Import fehlgeschlagen: ${error.message}`);
        }
      }

      if (!importedViaServer && DIRECT_DB_FALLBACK) {
        console.log('[4/4] Fallback: Import direkt in SQLite ...');
        const { savedChats, savedMessages } = directDbImport(chats, messages);
        console.log(`[OK] Direkter DB-Import erfolgreich: ${savedChats.length} Chats, ${savedMessages.length} Nachrichten.`);
        console.log('Hinweis: Falls der Server schon lief, App/Server einmal neu laden, damit alles sichtbar wird.');
      }

      console.log('');
      console.log('Fertig. Öffne jetzt deine Android-App. Die Chats sollten in der Chatliste sichtbar sein.');
      console.log('Dieses Fenster bleibt offen. Beenden mit STRG+C.');
    } catch (error) {
      console.error('[FEHLER]', error);
    }
  });

  await client.initialize();
}

main().catch((error) => {
  console.error('[FATAL]', error);
  process.exitCode = 1;
});
