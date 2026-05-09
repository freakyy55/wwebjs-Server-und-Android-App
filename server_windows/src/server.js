require('dotenv').config();

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const { randomUUID, timingSafeEqual } = require('crypto');
let QRCode = null;
try { QRCode = require('qrcode'); } catch (_) { QRCode = null; }

const { createDb } = require('./accountDb');
const { createAccountManager } = require('./accountManager');
const { INCOMING_DIR, sanitizeMediaFile, messageTypeForMime } = require('./mediaSecurity');
const { createProvider } = require('./providers');
const accessSecurity = require('./accessSecurity');

const VERSION = '0.2.40';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const LEGACY_APP_TOKEN = (process.env.APP_TOKEN || process.env.APP_KEY || '').trim();
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const TRUST_PROXY = String(process.env.TRUST_PROXY || '0').trim() === '1';
const REQUIRE_HTTPS = String(process.env.REQUIRE_HTTPS || '0').trim() === '1';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();

const SETUP_CODE_FILE = path.resolve(__dirname, '..', 'SETUP_CODE.txt');

function extractSetupCode(text) {
  const raw = String(text || '').replace(/\r/g, '');
  // SETUP_CODE.txt enthaelt absichtlich eine Ueberschrift und Hinweise.
  // Der echte Code ist die einzelne Zeile mit mindestens 16 Zeichen A-Z/0-9.
  const lineMatch = raw.match(/(?:^|\n)\s*([A-Z0-9]{16,})\s*(?:\n|$)/);
  if (lineMatch) return lineMatch[1].trim();
  const compact = raw.trim();
  if (/^[A-Z0-9]{16,}$/.test(compact)) return compact;
  return '';
}

function ensureSetupCode() {
  let code = '';
  try {
    if (fs.existsSync(SETUP_CODE_FILE)) {
      code = extractSetupCode(fs.readFileSync(SETUP_CODE_FILE, 'utf8'));
    }
  } catch (_) {}
  if (!code || code.length < 16 || /ECHO ist ausgeschaltet|ECHO is off|ECHO is on/i.test(code)) {
    code = randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
  }
  try {
    fs.writeFileSync(
      SETUP_CODE_FILE,
      [
        'Own Messenger Setup-Code',
        '========================',
        '',
        code,
        '',
        'Diesen Code nur fuer die QR-Einrichtungsseite benutzen:',
        'https://deine-domain.de/qr.php?setup=' + code,
        '',
        'Nach dem WhatsApp-Scan zeigt die Seite den App-Key fuer die Android-App an.',
        'Behandle diese Datei wie ein Passwort.',
        `Erstellt/aktualisiert: ${new Date().toISOString()}`,
        ''
      ].join('\n'),
      'utf8'
    );
  } catch (_) {}
  return code;
}
const SETUP_CODE = ensureSetupCode();
const UPLOAD_DIR = path.resolve(__dirname, '..', process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(INCOMING_DIR, { recursive: true });

function requestIsHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return req.secure || proto === 'https';
}

function normalizeIp(value) {
  return String(value || '').trim().replace(/^::ffff:/, '');
}

function isLoopbackIp(ip) {
  const value = normalizeIp(ip);
  return value === '127.0.0.1' || value === '::1' || value === 'localhost' || value === '::ffff:127.0.0.1';
}

function clientIpFromRequest(req) {
  // Hinter Caddy/Reverse-Proxy ist die Socket-IP immer 127.0.0.1.
  // Fuer oeffentliche HTTPS-Aufrufe muss deshalb X-Forwarded-For/req.ip gelten,
  // sonst wuerden QR-Code und App-Keys versehentlich im Internet angezeigt.
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  if (TRUST_PROXY && forwarded) return normalizeIp(forwarded);
  if (TRUST_PROXY && req.ip) return normalizeIp(req.ip);
  return normalizeIp(req.socket?.remoteAddress || req.connection?.remoteAddress || '');
}

function isLoopbackRequest(req) {
  return isLoopbackIp(clientIpFromRequest(req));
}

function requireEncryptedTransport(req, res, next) {
  if (!REQUIRE_HTTPS) return next();
  if (requestIsHttps(req) || isLoopbackRequest(req)) return next();
  return res.status(403).json({
    ok: false,
    error: 'Unsichere HTTP-Verbindung blockiert. Bitte HTTPS/WSS ueber die Domain benutzen.',
    code: 'HTTPS_REQUIRED'
  });
}

function addSecurityHeaders(req, res, next) {
  if (requestIsHttps(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', req.path.startsWith('/uploads') ? 'private, max-age=3600' : 'no-store');
  next();
}

function writeAppKeyFile() {
  if (!defaultAccount?.appKey || defaultAccount.appKey.length < 32) return;
  const file = path.resolve(__dirname, '..', 'APP_KEY.txt');
  const text = [
    'Own Messenger App-Key',
    '======================',
    '',
    defaultAccount.appKey,
    '',
    'Diesen Key in der Android-App eintragen.',
    'Behandle diese Datei wie ein Passwort.',
    `Erstellt/aktualisiert: ${new Date().toISOString()}`,
    ''
  ].join('\n');
  try { fs.writeFileSync(file, text, { encoding: 'utf8' }); } catch (_) {}
}


const app = express();
if (TRUST_PROXY) app.set('trust proxy', true);
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const accountManager = createAccountManager({ createProvider, createDb });
const duplicateKeyRepairs = typeof accountManager.getDuplicateKeyRepairs === 'function' ? accountManager.getDuplicateKeyRepairs() : [];
if (duplicateKeyRepairs.length) {
  console.log('[accounts] Doppelte App-Keys wurden automatisch repariert:');
  for (const item of duplicateKeyRepairs) {
    console.log(`  - ${item.accountId}: hatte denselben Key wie ${item.duplicatedWith}; neuer App-Key wurde erstellt.`);
  }
}
const accounts = accountManager.accounts;
const defaultAccount = accountManager.defaultAccount;
const provider = defaultAccount?.provider;
const db = defaultAccount?.db;
const socketsByAccount = new Map();
const lastWhatsAppQrByAccount = new Map();
// APP_KEY.txt wird erst nach erfolgreichem WhatsApp-QR-Scan/Verbindung geschrieben.

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, INCOMING_DIR),
  filename: (_req, file, cb) => {
    const safeOriginal = String(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = path.extname(safeOriginal);
    const base = path.basename(safeOriginal, ext).slice(0, 60) || 'file';
    cb(null, `${Date.now()}_${randomUUID()}_${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024 } });


app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
app.use(addSecurityHeaders);
app.use(requireEncryptedTransport);
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));
app.use('/uploads/_incoming', (_req, res) => res.status(403).json({ ok: false, error: 'raw uploads are not public' }));
app.use('/uploads/quarantine', (_req, res) => res.status(403).json({ ok: false, error: 'quarantine is not public' }));
app.use('/uploads', requireAppToken, express.static(UPLOAD_DIR, { fallthrough: false, maxAge: '1h' }));

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
}

function appTokenFromRequest(req) {
  return (
    bearer(req) ||
    req.headers['x-app-key'] ||
    req.headers['x-app-token'] ||
    req.query.key ||
    req.query.token ||
    ''
  ).toString().trim();
}

function safeTokenEquals(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const authFailureBuckets = new Map();
function tooManyAuthFailures(req) {
  const ip = accessSecurity.deviceFromRequest(req).ip;
  const now = Date.now();
  const bucket = authFailureBuckets.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < 10 * 60 * 1000);
  authFailureBuckets.set(ip, fresh);
  return fresh.length >= Number(process.env.SECURITY_AUTH_FAIL_LIMIT || 20);
}

function recordAuthFailure(req) {
  const ip = accessSecurity.deviceFromRequest(req).ip;
  const bucket = authFailureBuckets.get(ip) || [];
  bucket.push(Date.now());
  authFailureBuckets.set(ip, bucket.slice(-50));
}

const lockdownRunningByAccount = new Set();
function closeAccountSockets(accountId, code = 4001, reason = 'Security lockdown') {
  const set = socketsByAccount.get(accountId);
  if (!set) return;
  for (const ws of set) {
    try { ws.close(code, reason); } catch (_) {}
  }
}

function triggerSecurityLockdown(reason, req, details = {}) {
  const account = req.account || defaultAccount;
  const accountId = account?.id || 'main';
  if (lockdownRunningByAccount.has(accountId)) return;
  lockdownRunningByAccount.add(accountId);
  accessSecurity.audit('security_lockdown_start', req, { reason, accountId, ...details });
  closeAccountSockets(accountId);

  (async () => {
    try {
      if (account?.provider?.client?.logout) await account.provider.client.logout();
    } catch (error) {
      accessSecurity.audit('whatsapp_logout_failed', req, { accountId, error: error.message });
    }
    try {
      if (account?.provider?.stop) await account.provider.stop();
    } catch (error) {
      accessSecurity.audit('provider_stop_failed', req, { accountId, error: error.message });
    }
    if (String(process.env.SECURITY_DELETE_WA_SESSION_ON_LOCKDOWN || '1') !== '0') {
      try {
        const authDir = account?.provider?.authDataPath || path.join(account?.accountRoot || path.resolve(__dirname, '..'), '.wwebjs_auth');
        if (fs.existsSync(authDir)) fs.rmSync(authDir, { recursive: true, force: true });
        accessSecurity.audit('whatsapp_session_deleted', req, { accountId, authDir });
      } catch (error) {
        accessSecurity.audit('whatsapp_session_delete_failed', req, { accountId, error: error.message });
      }
    }
    accessSecurity.audit('security_lockdown_done', req, { reason, accountId });
  })();
}

function attachAccountToRequest(req) {
  const token = appTokenFromRequest(req);
  const account = accountManager.getByToken(token);
  if (!account) return null;
  req.account = account;
  req.db = account.db;
  req.provider = account.provider;
  return account;
}

function requireAppToken(req, res, next) {
  // Lokales Windows-Kontrollpanel nutzt /api/local/* und wird separat auf 127.0.0.1 begrenzt.
  if (String(req.path || '').startsWith('/local/')) return next();
  if (!accounts.length) return res.status(503).json({ ok: false, error: 'Keine Accounts konfiguriert.' });
  if (tooManyAuthFailures(req)) {
    accessSecurity.audit('auth_rate_limited', req);
    return res.status(429).json({ ok: false, error: 'Zu viele falsche App-Key Versuche. Bitte spaeter erneut versuchen.' });
  }

  const account = attachAccountToRequest(req);
  if (!account) {
    recordAuthFailure(req);
    accessSecurity.audit('auth_failed_bad_key', req);
    return res.status(401).json({ ok: false, error: 'Unauthorized: App-Key fehlt oder ist falsch' });
  }

  const deviceCheck = accessSecurity.verifySingleDevice(req, account.id);
  if (!deviceCheck.ok) {
    triggerSecurityLockdown(deviceCheck.code || 'device_check_failed', req, { accountId: account.id });
    return res.status(deviceCheck.status || 423).json({ ok: false, error: deviceCheck.message, code: deviceCheck.code, security: accessSecurity.getStatus(account.id) });
  }

  accessSecurity.audit(deviceCheck.firstUse ? 'auth_ok_first_device_bound' : 'auth_ok', req, { accountId: account.id });
  next();
}

function requireAdminAccount(req, res, next) {
  if (!req.account?.admin) return res.status(403).json({ ok: false, error: 'Admin-Key erforderlich.' });
  next();
}

function requireBridgeToken(req, res, next) {
  if (!BRIDGE_TOKEN || BRIDGE_TOKEN === 'change-me-for-bridge') return next();
  const token = bearer(req) || req.headers['x-bridge-token'];
  if (token !== BRIDGE_TOKEN) return res.status(401).json({ ok: false, error: 'Bridge unauthorized' });
  next();
}

app.use('/api', requireAppToken);
app.use('/dev', requireAppToken);
app.use('/provider', requireBridgeToken);

function getAccountSockets(accountId) {
  if (!socketsByAccount.has(accountId)) socketsByAccount.set(accountId, new Set());
  return socketsByAccount.get(accountId);
}

function broadcastToAccount(account, event, data) {
  const accountId = account?.id || 'main';
  const payload = JSON.stringify({ event, data, accountId });
  for (const ws of getAccountSockets(accountId)) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

function broadcast(event, data) {
  broadcastToAccount(defaultAccount, event, data);
}

function sendToSocket(ws, event, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ event, data }));
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function normalizeChatId(value) {
  return String(value || '').trim();
}


function toWwebJid(value) {
  const raw = normalizeChatId(value);
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  return `${raw}@c.us`;
}

function requireDemoClient(req, res) {
  const p = req.provider || provider;
  if (!p?.client) {
    res.status(400).json({ ok: false, error: 'Aktiver Provider hat keinen lokalen Demo-Client. Diese /api/wwebjs/demo-Endpunkte funktionieren nur mit PROVIDER=wwebjs-demo oder wwebjs.' });
    return null;
  }
  return p.client;
}

async function serializeChat(chat) {
  const messages = await chat.fetchMessages({ limit: 1 });
  return {
    id: chat.id._serialized,
    name: chat.name,
    isGroup: chat.isGroup,
    timestamp: chat.timestamp,
    unreadCount: chat.unreadCount,
    archived: chat.archived,
    pinned: chat.pinned,
    isMuted: chat.isMuted,
    muteExpiration: chat.muteExpiration,
    lastMessage: messages[0]?.body || chat.lastMessage || ''
  };
}

function serializeMessage(message) {
  return {
    id: message.id._serialized,
    messageId: message.id._serialized,
    from: message.from,
    to: message.to,
    author: message.author,
    fromMe: message.fromMe,
    body: message.body,
    type: message.type,
    timestamp: message.timestamp,
    ack: message.ack,
    hasMedia: message.hasMedia
  };
}

function incomingMessageFromPayload(payload, targetDb = db) {
  const fromMe = payload.fromMe === true || payload.from_me === true || payload.direction === 'out' || payload.direction === 'outgoing';
  const chatId = normalizeChatId(
    payload.chatId || payload.chat_id || payload.contact_wa_id || payload.peerJid || (fromMe ? payload.to : payload.from)
  );
  const body = sanitizeText(payload.text || payload.body || payload.message || payload.caption);
  if (!chatId) throw new Error('chatId/from/to/contact_wa_id is required');

  return targetDb.insertMessage({
    id: payload.id || payload.messageId || payload.waMessageId || payload.providerMessageId || `${fromMe ? 'out' : 'in'}_${randomUUID()}`,
    providerMessageId: payload.providerMessageId || payload.waMessageId || payload.messageId || payload.id || null,
    chatId,
    senderName: payload.name || payload.senderName || payload.sender_name || payload.contact_name || (fromMe ? 'Ich' : chatId),
    senderId: payload.senderId || payload.sender_id || payload.author || (fromMe ? payload.from : payload.from) || null,
    senderNumber: payload.senderNumber || payload.sender_number || null,
    chatName: payload.chatName || payload.chat_name || null,
    body,
    direction: fromMe ? 'out' : 'in',
    fromMe,
    type: payload.type || payload.message_type || 'text',
    timestamp: payload.timestamp || targetDb.nowSeconds(),
    status: payload.status || (fromMe ? 'sent' : 'received'),
    mediaUrl: payload.mediaUrl || payload.media_url || payload.url || null,
    fileName: payload.fileName || payload.file_name || payload.filename || null,
    mimeType: payload.mimeType || payload.mime_type || payload.mimetype || null,
    fileSize: payload.fileSize || payload.file_size || payload.size || null,
    scanStatus: payload.scanStatus || payload.scan_status || null,
    scanResult: payload.scanResult || payload.scan_result || null,
    originalFileName: payload.originalFileName || payload.original_file_name || null,
    originalMimeType: payload.originalMimeType || payload.original_mime_type || null,
    raw: payload
  });
}


function formatCallForLog(call) {
  const ts = call.timestamp ? new Date(Number(call.timestamp) * 1000).toISOString() : new Date().toISOString();
  const kind = call.isVideo ? 'Videoanruf' : 'Sprachanruf';
  const direction = call.direction || (call.outgoing ? 'outgoing' : 'incoming');
  const missed = call.missed ? 'verpasst' : 'angenommen/erfasst';
  const name = call.name || call.chatId || call.peerJid || 'Unbekannt';
  const chatId = call.chatId || call.peerJid || '';
  return `${ts} | ${direction} | ${kind} | ${missed} | ${name}${chatId && chatId !== name ? ` (${chatId})` : ''}`;
}

function logIncomingCall(call, req) {
  const line = formatCallForLog(call);
  console.log('');
  console.log('============================================================');
  console.log('WhatsApp-Anrufversuch erkannt');
  console.log(line);
  console.log('============================================================');
  console.log('');
  try {
    accessSecurity.audit('whatsapp_call_detected', req || { headers: {}, socket: {} }, {
      callId: call.id,
      chatId: call.chatId,
      name: call.name,
      direction: call.direction,
      missed: call.missed,
      isVideo: call.isVideo,
      timestamp: call.timestamp
    });
  } catch (_) {}
}

function callFromPayload(payload, targetDb = db) {
  return targetDb.insertCall({
    id: payload.id || payload.callId || `call_${randomUUID()}`,
    chatId: payload.chatId || payload.chat_id || payload.peerJid || payload.from,
    name: payload.name || payload.contact_name || payload.from || payload.peerJid || payload.chatId,
    direction: payload.direction || (payload.outgoing ? 'out' : 'in'),
    missed: payload.missed !== undefined ? payload.missed : true,
    isVideo: payload.isVideo || payload.is_video || false,
    timestamp: payload.timestamp || targetDb.nowSeconds(),
    raw: payload
  });
}


function callFromMessagePayload(payload, targetDb = db) {
  const body = String(payload.body || payload.text || payload.message || payload.caption || '').trim();
  const type = String(payload.type || payload.message_type || payload.raw?.type || '').toLowerCase();
  const rawType = String(payload.raw?.type || payload._data?.type || '').toLowerCase();
  const marker = `${type} ${rawType} ${body}`.toLowerCase();

  const looksLikeCall =
    /(^|[\s_\-.])call([\s_\-.]|$)/i.test(marker) ||
    /call[_\s-]?log|call[_\s-]?missed|missed[_\s-]?call|voice[_\s-]?call|video[_\s-]?call|sprachanruf|videoanruf|anruf|angerufen|anzurufen/i.test(marker);

  if (!looksLikeCall) return null;

  const fromMe = payload.fromMe === true || payload.from_me === true || payload.direction === 'out' || payload.direction === 'outgoing';
  const direction = fromMe ? 'out' : 'in';
  const chatId = normalizeChatId(
    payload.chatId || payload.chat_id || payload.peerJid || payload.contact_wa_id || payload.remote || (fromMe ? payload.to : payload.from) || payload.from || payload.to
  );
  if (!chatId) return null;

  const missed = fromMe ? false : !/angenommen|accepted|answered|verbunden|connected/i.test(marker);
  const isVideo = /video/i.test(marker) || payload.isVideo === true || payload.is_video === true;
  const baseId = payload.id || payload.messageId || payload.providerMessageId || payload.waMessageId || payload.provider_message_id || payload.wa_message_id || randomUUID();
  const displayName = payload.chatName || payload.chat_name || payload.name || payload.senderName || payload.sender_name || payload.contact_name || chatId;

  return targetDb.insertCall({
    id: `msgcall_${String(baseId)}`,
    chatId,
    name: displayName,
    direction,
    missed,
    isVideo,
    timestamp: payload.timestamp || targetDb.nowSeconds(),
    raw: { source: 'message', ...payload }
  });
}

function maybeStoreCallFromMessage(payload, targetDb = db) {
  try {
    return callFromMessagePayload(payload, targetDb);
  } catch (error) {
    console.log('[calls] call-log from message failed:', error.message);
    return null;
  }
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function accountStatusText(account) {
  if (!account?.provider) return 'kein Provider';
  return account.provider.state || (account.provider.ready ? 'CONNECTED' : 'STARTING');
}

function accountReady(account) {
  return Boolean(account?.provider?.ready || String(account?.provider?.state || '').toUpperCase().includes('CONNECTED'));
}

function accountPublicStatus(account) {
  const p = account?.provider || {};
  return {
    id: account?.id || '',
    name: account?.name || '',
    provider: p.name || account?.providerName || '',
    state: accountStatusText(account),
    ready: accountReady(account),
    clientId: account?.clientId || p.clientId || '',
    connectedNumber: p.connectedNumber || '',
    connectedWid: p.connectedWid || '',
    dbPath: account?.dbPath || ''
  };
}

function getQrPayloadForAccount(account) {
  if (!account?.id) return null;
  const cached = lastWhatsAppQrByAccount.get(account.id);
  if (cached?.qr) return cached;
  const providerQr = account.provider?.lastQrRaw || account.provider?.lastQr || '';
  if (!providerQr) return null;
  const payload = {
    provider: account.provider?.name || 'wwebjs',
    qr: providerQr,
    timestamp: account.provider?.lastQrAt || Math.floor(Date.now() / 1000),
    source: 'provider-memory'
  };
  lastWhatsAppQrByAccount.set(account.id, payload);
  return payload;
}


function nextAccountId() {
  const used = new Set(accounts.map(a => a.id));
  for (let i = 2; i < 10000; i += 1) {
    const id = `wa${i}`;
    if (!used.has(id)) return id;
  }
  return `wa_${Date.now()}`;
}

function nextAccountName() {
  const n = Math.max(2, accounts.length + 1);
  return `WhatsApp Nummer ${n}`;
}

app.get(['/qr.php', '/qr'], async (req, res) => {
  const detectedBase = `${requestIsHttps(req) ? 'https' : 'http'}://${req.headers.host || `localhost:${PORT}`}`;
  const baseUrl = (PUBLIC_BASE_URL || detectedBase).replace(/\/$/, '');
  const setupParam = String(req.query.setup || req.query.code || '').trim();
  const adminParam = String(req.query.admin || req.query.key || '').trim();
  const accountParam = String(req.query.account || '').trim();
  const setupOk = setupParam && setupParam === SETUP_CODE;
  const adminAccount = adminParam ? accountManager.getByToken(adminParam) : null;
  const canUse = isLoopbackRequest(req) || setupOk || Boolean(adminAccount?.admin);
  const requestedAccount = accountParam ? accounts.find(a => a.id === accountParam) : null;
  const selectedAccount = requestedAccount || adminAccount || defaultAccount;
  const querySecret = setupOk ? `setup=${encodeURIComponent(SETUP_CODE)}` : (adminParam ? `admin=${encodeURIComponent(adminParam)}` : '');
  const selectedId = encodeURIComponent(selectedAccount?.id || 'main');
  const baseQs = querySecret ? `${querySecret}&account=${selectedId}` : `account=${selectedId}`;

  if (canUse && req.query.ack === '1' && selectedAccount) {
    try { accountManager.acknowledgeAppKey(selectedAccount); } catch (_) {}
    return res.redirect(`/qr.php?${baseQs}`);
  }

  if (canUse && req.query.new === '1') {
    // Seit v0.2.39 gibt es feste Slots main + wa2..wa5. "Neu" springt zum ersten freien Slot.
    const free = accounts.find(a => a.id !== defaultAccount?.id && !accountReady(a) && !(typeof a.provider?.hasSession === 'function' && a.provider.hasSession())) || accounts.find(a => !accountReady(a));
    const target = free || selectedAccount || defaultAccount;
    const qs = querySecret ? `${querySecret}&account=${encodeURIComponent(target.id)}` : `account=${encodeURIComponent(target.id)}`;
    return res.redirect(`/qr.php?${qs}`);
  }

  if (canUse && selectedAccount?.provider && (req.query.start === '1' || req.query.restart === '1' || req.query.stop === '1' || req.query.reset === '1')) {
    try {
      if (req.query.stop === '1' && typeof selectedAccount.provider.stop === 'function') {
        await selectedAccount.provider.stop();
      } else if (req.query.reset === '1' && typeof selectedAccount.provider.resetSession === 'function') {
        lastWhatsAppQrByAccount.delete(selectedAccount.id);
        await selectedAccount.provider.resetSession();
      } else if (req.query.restart === '1' && typeof selectedAccount.provider.restart === 'function') {
        lastWhatsAppQrByAccount.delete(selectedAccount.id);
        await selectedAccount.provider.restart();
      } else if (typeof selectedAccount.provider.start === 'function') {
        await selectedAccount.provider.start();
      }
    } catch (error) {
      selectedAccount.provider.lastError = error?.stack || error?.message || String(error);
      selectedAccount.provider.state = 'ERROR';
    }
    return res.redirect(`/qr.php?${baseQs}`);
  }

  let pairingMessage = '';
  if (canUse && selectedAccount?.provider && req.query.pair === '1') {
    try {
      const phone = String(req.query.phone || '').trim();
      const code = await selectedAccount.provider.requestPairingCode(phone);
      pairingMessage = code ? `Pairing-Code erzeugt: ${code}` : 'Pairing-Code wurde angefordert.';
    } catch (error) {
      selectedAccount.provider.lastPairingError = error?.message || String(error);
      selectedAccount.provider.lastError = selectedAccount.provider.lastPairingError;
    }
  }

  const ready = accountReady(selectedAccount);
  const providerState = String(accountStatusText(selectedAccount));
  const providerStateUpper = providerState.toUpperCase();
  const providerError = selectedAccount?.provider?.lastError || selectedAccount?.provider?.lastSyncError || selectedAccount?.provider?.lastPairingError || '';
  const lastPairingCode = selectedAccount?.provider?.lastPairingCode || '';
  const lastPairingPhone = selectedAccount?.provider?.lastPairingPhone || '';
  const hasSession = typeof selectedAccount?.provider?.hasSession === 'function' ? selectedAccount.provider.hasSession() : false;
  const qrPayload = getQrPayloadForAccount(selectedAccount);
  const qrRaw = qrPayload?.qr || '';
  let qrImage = '';
  let qrError = '';

  if (qrRaw && QRCode) {
    try {
      qrImage = await QRCode.toDataURL(qrRaw, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
    } catch (error) {
      qrError = error.message || String(error);
    }
  }

  const accountOptions = accounts.map(a => {
    const state = accountStatusText(a);
    const key = a.appKey && a.appKey.length >= 32 ? 'Key' : 'kein Key';
    return `<option value="${htmlEscape(a.id)}"${a.id === selectedAccount?.id ? ' selected' : ''}>${htmlEscape(a.name)} (${htmlEscape(a.id)}) - ${htmlEscape(state)} / ${key}</option>`;
  }).join('');
  const switchForm = canUse && accounts.length > 1
    ? `<form class="switch" method="get" action="/qr.php">${setupOk ? `<input type="hidden" name="setup" value="${htmlEscape(SETUP_CODE)}" />` : (adminParam ? `<input type="hidden" name="admin" value="${htmlEscape(adminParam)}" />` : '')}<label>WhatsApp-Account</label><select name="account" onchange="this.form.submit()">${accountOptions}</select></form>`
    : '';

  const accountName = selectedAccount?.name || selectedAccount?.id || 'main';
  const controls = canUse ? `
    <div class="actions">
      <a class="buttonlink primary" href="/qr.php?${baseQs}&start=1">Slot starten / koppeln</a>
      <a class="buttonlink" href="/qr.php?${baseQs}&restart=1">Provider neu starten</a>
      <a class="buttonlink ghost" href="/qr.php?${baseQs}&stop=1">Provider stoppen</a>
      <a class="buttonlink danger" href="/qr.php?${baseQs}&reset=1" onclick="return confirm('WhatsApp-Session fuer diesen Account wirklich loeschen? Danach muss diese Nummer neu gekoppelt werden.')">Session loeschen</a>
    </div>` : '';

  const slotTableRows = accounts.map(a => {
    const rowQs = querySecret ? `${querySecret}&account=${encodeURIComponent(a.id)}` : `account=${encodeURIComponent(a.id)}`;
    const state = accountStatusText(a);
    const session = typeof a.provider?.hasSession === 'function' && a.provider.hasSession() ? 'ja' : 'nein';
    const key = a.appKey && a.appKey.length >= 32 ? 'erstellt' : 'noch nicht';
    return `<tr class="${a.id === selectedAccount?.id ? 'active' : ''}"><td><b>${htmlEscape(a.name)}</b><br><code>${htmlEscape(a.id)}</code></td><td><code>${htmlEscape(state)}</code></td><td>${session}</td><td>${key}</td><td><a href="/qr.php?${rowQs}">öffnen</a></td></tr>`;
  }).join('');

  const slotTable = canUse ? `
    <div class="card tablecard">
      <h2>Bis zu ${htmlEscape(String(accountManager.maxWaAccounts || 5))} WhatsApp-Nummern</h2>
      <p class="hint">Wichtig: Neue Nummern einzeln koppeln. Nicht alle leeren Slots gleichzeitig starten. Verbundene Slots starten beim Serverstart automatisch.</p>
      <table><thead><tr><th>Slot</th><th>Status</th><th>Session</th><th>App-Key</th><th></th></tr></thead><tbody>${slotTableRows}</tbody></table>
    </div>` : '';

  const pairingForm = canUse && !ready ? `
    <div class="pairbox">
      <h2>Alternativ: WhatsApp-Code statt QR</h2>
      <p>Nummer international ohne <b>+</b> eingeben, z.B. <code>491701234567</code>. Dann in WhatsApp: <b>Gekoppelte Geräte → Gerät koppeln → Mit Telefonnummer verknüpfen</b>.</p>
      <form method="get" action="/qr.php" class="setup">
        ${setupOk ? `<input type="hidden" name="setup" value="${htmlEscape(SETUP_CODE)}" />` : (adminParam ? `<input type="hidden" name="admin" value="${htmlEscape(adminParam)}" />` : '')}
        <input type="hidden" name="account" value="${htmlEscape(selectedAccount?.id || 'main')}" />
        <input type="hidden" name="pair" value="1" />
        <input name="phone" placeholder="491701234567" value="${htmlEscape(lastPairingPhone)}" autocomplete="off" />
        <button type="submit">Pairing-Code erzeugen</button>
      </form>
      ${lastPairingCode ? `<div class="codebox"><span>Pairing-Code</span><strong>${htmlEscape(lastPairingCode)}</strong></div>` : ''}
      ${pairingMessage ? `<p class="ok">${htmlEscape(pairingMessage)}</p>` : ''}
      ${selectedAccount?.provider?.lastPairingError ? `<pre>${htmlEscape(selectedAccount.provider.lastPairingError)}</pre>` : ''}
    </div>` : '';

  let content = '';
  if (!canUse) {
    const setupWarning = setupParam ? '<p class="warn"><b>Setup-Code falsch.</b> Bitte exakt die einzelne Code-Zeile aus <code>SETUP_CODE.txt</code> eingeben, nicht die komplette Datei.</p>' : '';
    content = `
      <div class="card hero">
        <h1>WhatsApp QR einrichten</h1>
        ${setupWarning}
        <p>Gib den Setup-Code aus <code>SETUP_CODE.txt</code> ein. Danach kannst du bis zu 5 WhatsApp-Nummern einzeln koppeln.</p>
        <form class="setup" method="get" action="/qr.php">
          <input name="setup" placeholder="Setup-Code" autocomplete="off" autofocus />
          <button type="submit">Oeffnen</button>
        </form>
        <p class="hint">Direkt auf dem Server geht auch <code>http://127.0.0.1:3000/qr.php</code>.</p>
      </div>`;
  } else if (ready) {
    const appKey = accountManager.ensureAppKey(selectedAccount);
    content = `
      <div class="card success hero">
        <h1>WhatsApp verbunden</h1>
        <p class="ok">Account <b>${htmlEscape(accountName)}</b> ist verbunden.</p>
        ${selectedAccount.appKeyAcknowledged ? '<p>Der App-Key wurde ausgeblendet, weil du ihn bereits in die Android-App übernommen hast.</p>' : `<p>App-Key fuer genau diese WhatsApp-Nummer:</p><pre class="secret">${htmlEscape(appKey)}</pre>`}
        <p><b>Server-Link in der App:</b></p>
        <pre>${htmlEscape(baseUrl)}</pre>
        <p class="hint">Jede Nummer hat einen eigenen App-Key. In der Android-App entscheidet der Key, ueber welche WhatsApp-Nummer gesendet wird.</p>
        ${selectedAccount.appKeyAcknowledged ? '' : `<p><a class="buttonlink primary" href="/qr.php?${baseQs}&ack=1">App-Key wurde in der App eingetragen</a></p>`}
        ${controls}
      </div>`;
  } else if (providerStateUpper === 'NOT_STARTED' || providerStateUpper === 'STOPPED') {
    content = `
      <div class="card hero">
        <h1>${htmlEscape(accountName)} koppeln</h1>
        <p>Dieser Slot ist noch nicht gestartet. Klicke zuerst auf <b>Slot starten / koppeln</b>. Danach erscheint QR oder du erzeugst einen WhatsApp-Code.</p>
        <p>Status: <code>${htmlEscape(providerState)}</code> · Session vorhanden: <b>${hasSession ? 'ja' : 'nein'}</b></p>
        ${providerError ? `<pre>${htmlEscape(providerError)}</pre>` : ''}
        ${controls}
        ${pairingForm}
      </div>`;
  } else if (providerStateUpper === 'ERROR' || providerStateUpper === 'AUTH_FAILURE') {
    content = `
      <div class="card hero">
        <h1>WhatsApp QR einrichten</h1>
        <p class="warn"><b>Status: ${htmlEscape(providerState)}</b><br>Wenn am Handy „Gerät konnte nicht hinzugefügt werden“ kommt, lösche für diesen Slot die Session und starte nur diesen Slot neu. Account 1 darf verbunden bleiben.</p>
        ${providerError ? `<pre>${htmlEscape(providerError)}</pre>` : '<p>Im Server-Fenster steht die genaue Fehlermeldung.</p>'}
        ${controls}
        ${pairingForm}
      </div>`;
  } else if (!qrRaw) {
    content = `
      <div class="card hero">
        <h1>WhatsApp QR einrichten</h1>
        <p>Noch kein QR-Code vorhanden. Warte ein paar Sekunden oder nutze den WhatsApp-Code.</p>
        <p>Account: <b>${htmlEscape(accountName)}</b></p>
        <p>Status: <code>${htmlEscape(providerState)}</code> · Session vorhanden: <b>${hasSession ? 'ja' : 'nein'}</b></p>
        ${providerError ? `<pre>${htmlEscape(providerError)}</pre>` : ''}
        ${controls}
        ${pairingForm}
      </div>`;
  } else if (!QRCode) {
    content = `
      <div class="card hero">
        <h1>WhatsApp QR einrichten</h1>
        <p class="warn">Das Paket <code>qrcode</code> fehlt. Starte die BAT einmal neu, damit npm die Abhaengigkeit installiert.</p>
        <pre>${htmlEscape(qrRaw)}</pre>
        ${controls}
        ${pairingForm}
      </div>`;
  } else if (qrError) {
    content = `
      <div class="card hero">
        <h1>WhatsApp QR einrichten</h1>
        <p class="warn">QR konnte nicht als Bild erzeugt werden: ${htmlEscape(qrError)}</p>
        <pre>${htmlEscape(qrRaw)}</pre>
        ${controls}
        ${pairingForm}
      </div>`;
  } else {
    content = `
      <div class="card hero">
        <h1>WhatsApp QR scannen</h1>
        <p>Für <b>${htmlEscape(accountName)}</b>: WhatsApp öffnen → <b>Gekoppelte Geräte</b> → <b>Gerät koppeln</b> → QR scannen.</p>
        <div class="qrbox"><img src="${qrImage}" alt="WhatsApp QR-Code" /></div>
        <p>Status: <code>${htmlEscape(providerState)}</code></p>
        <p class="hint">Wenn das Handy meldet „Gerät konnte nicht hinzugefügt werden“: Session für diesen Slot löschen, dann nur diesen Slot neu starten. Danach alternativ Pairing-Code probieren.</p>
        ${controls}
        ${pairingForm}
      </div>`;
  }

  const refreshSeconds = ready ? 0 : (qrRaw ? 20 : 4);
  const refreshMeta = refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}" />` : '';

  res.type('html').send(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${refreshMeta}
  <title>Own Messenger QR Setup</title>
  <style>
    :root { color-scheme: dark; --bg:#061016; --card:#111b21; --card2:#16252d; --line:#27424b; --text:#e9edef; --muted:#a8bac1; --green:#36d391; --red:#ff6b6b; --yellow:#ffcc66; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; padding:24px; font-family:Segoe UI,Arial,Helvetica,sans-serif; background:radial-gradient(circle at top left,#104036,#061016 45%,#03080b); color:var(--text); }
    .wrap { width:min(1040px,100%); margin:0 auto; }
    .card { background:linear-gradient(180deg,var(--card),#0c151a); border:1px solid var(--line); border-radius:24px; padding:24px; box-shadow:0 18px 50px rgba(0,0,0,.35); margin:16px 0; }
    .hero { text-align:center; }
    h1 { margin:0 0 12px; font-size:32px; } h2 { margin:0 0 10px; font-size:20px; }
    p { color:var(--muted); line-height:1.5; }
    code, pre, input, select { background:#202c33; border:1px solid #2a3b44; border-radius:12px; color:#dff7ee; }
    code { padding:2px 6px; } pre { padding:14px; overflow:auto; white-space:pre-wrap; text-align:left; user-select:all; }
    .secret { font-size:18px; letter-spacing:.5px; word-break:break-all; }
    .qrbox { display:inline-flex; background:white; padding:16px; border-radius:20px; margin:14px 0; }
    .qrbox img { width:320px; height:320px; display:block; image-rendering:pixelated; }
    .ok { color:var(--green); font-weight:bold; } .warn { border-left:4px solid var(--yellow); padding:12px 14px; background:#211d12; border-radius:10px; color:#ffdf9a; text-align:left; }
    .hint { font-size:14px; color:#91a4ac; }
    .setup,.switch { display:flex; gap:10px; justify-content:center; align-items:center; margin:18px 0; flex-wrap:wrap; }
    input,select { padding:12px; min-width:260px; } button { border:0; border-radius:12px; padding:12px 16px; background:var(--green); color:#061016; font-weight:bold; cursor:pointer; }
    .actions { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:16px; }
    .buttonlink { display:inline-block; border-radius:12px; padding:12px 16px; background:#24353d; color:#e9edef; font-weight:700; text-decoration:none; border:1px solid #34515b; }
    .buttonlink.primary { background:var(--green); color:#061016; border-color:var(--green); } .buttonlink.danger { background:var(--red); color:#170707; border-color:var(--red); } .buttonlink.ghost { background:transparent; }
    table { width:100%; border-collapse:collapse; overflow:hidden; border-radius:16px; } th,td { border-bottom:1px solid #263842; padding:12px; text-align:left; vertical-align:top; color:#cfe1e7; } th { color:#7fe0b0; font-size:13px; text-transform:uppercase; letter-spacing:.04em; } tr.active td { background:#102820; }
    .pairbox { margin-top:18px; padding:18px; background:#0d1d23; border:1px solid #25434d; border-radius:18px; }
    .codebox { display:inline-flex; flex-direction:column; gap:6px; background:#e9edef; color:#061016; border-radius:16px; padding:16px 22px; margin:10px 0; } .codebox span { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#52636a; } .codebox strong { font-size:32px; letter-spacing:.18em; }
    @media(max-width:700px){ body{padding:12px}.qrbox img{width:260px;height:260px}.card{padding:18px} table{font-size:13px} }
  </style>
</head>
<body>
  <main class="wrap">
    ${switchForm}
    ${content}
    ${slotTable}
    <p class="hint" style="text-align:center">Own Messenger Server v${htmlEscape(VERSION)}</p>
  </main>
</body>
</html>`);
});

app.get('/', async (req, res) => {
  const detectedBase = `${requestIsHttps(req) ? 'https' : 'http'}://${req.headers.host || `localhost:${PORT}`}`;
  const baseUrl = (PUBLIC_BASE_URL || detectedBase).replace(/\/$/, '');
  const wsUrl = baseUrl.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:') + '/ws';
  const appKeyStatus = accounts.length ? `${accounts.length} Key(s) aktiv` : 'aus';
  const adminParam = String(req.query.admin || req.query.key || '').trim();
  const accountParam = String(req.query.account || '').trim();
  const adminAccount = adminParam ? accountManager.getByToken(adminParam) : null;
  const canShowSecrets = isLoopbackRequest(req) || Boolean(adminAccount?.admin);
  const requestedAccount = accountParam ? accounts.find(a => a.id === accountParam) : null;
  const selectedAccount = requestedAccount || adminAccount || defaultAccount;
  const providerState = accountStatusText(selectedAccount);
  const selectedProviderName = selectedAccount?.provider?.name || selectedAccount?.provider || 'none';
  const adminQs = adminParam ? `admin=${encodeURIComponent(adminParam)}` : '';
  const selectedAccountQs = `${adminQs ? `${adminQs}&` : ''}account=${encodeURIComponent(selectedAccount?.id || 'main')}`;
  const qrPayload = getQrPayloadForAccount(selectedAccount);
  const qrRaw = qrPayload?.qr || '';
  let qrImage = '';
  let qrError = '';
  if (qrRaw && QRCode) {
    try {
      qrImage = await QRCode.toDataURL(qrRaw, { width: 280, margin: 1, errorCorrectionLevel: 'M' });
    } catch (error) {
      qrError = error.message || String(error);
    }
  }

  const rootAccountOptions = accounts.map(a => `<option value="${htmlEscape(a.id)}"${a.id === selectedAccount?.id ? ' selected' : ''}>${htmlEscape(a.name)} (${htmlEscape(a.id)})</option>`).join('');
  const rootAccountSwitcherHtml = canShowSecrets && accounts.length > 1
    ? `<div class="card wide"><h2>WhatsApp-Account auswaehlen</h2><form method="get" action="/" class="inlineform">${adminParam ? `<input type="hidden" name="admin" value="${htmlEscape(adminParam)}" />` : ''}<select name="account" onchange="this.form.submit()">${rootAccountOptions}</select><button type="submit">Anzeigen</button></form><p class="hint">Jede WhatsApp-Nummer hat eine eigene Session, eigene Datenbank und eigenen App-Key. Der ausgewaehlte Account ist nur die Ansicht hier auf der Webseite.</p></div>`
    : '';

  const docs = [
    { method: 'GET', path: '/health', auth: 'Nein', desc: 'Serverstatus, Version, Provider-Status und Datenbankpfad.' },
    { method: 'GET', path: '/api/bootstrap', auth: 'Ja', desc: 'Initialdaten für die App: Chats, Nachrichten, Anrufe und Einstellungen.' },
    { method: 'GET', path: '/api/chats', auth: 'Ja', desc: 'Chatliste abrufen.' },
    { method: 'GET', path: '/api/chats/:chatId/messages', auth: 'Ja', desc: 'Nachrichten eines Chats abrufen.' },
    { method: 'GET', path: '/api/messages', auth: 'Ja', desc: 'Alle bekannten Nachrichten abrufen.' },
    { method: 'GET', path: '/api/calls', auth: 'Ja', desc: 'WhatsApp-Anrufversuche / verpasste Anrufe abrufen.' },
    { method: 'GET', path: '/api/sync/status', auth: 'Ja', desc: 'Status vom WhatsApp-Sync anzeigen.' },
    { method: 'POST', path: '/api/sync/now', auth: 'Ja', desc: 'WhatsApp-Sync manuell starten.' },
    { method: 'POST', path: '/api/send', auth: 'Ja', desc: 'Textnachricht senden.' },
    { method: 'POST', path: '/api/media/send', auth: 'Ja', desc: 'Bild, Datei oder Sprachnachricht sicher prüfen und senden.' },
    { method: 'GET', path: '/api/security/status', auth: 'Ja', desc: '1-Gerät-Schutz, Lockdown und Sicherheitsstatus anzeigen.' },
    { method: 'GET', path: '/api/wwebjs/info', auth: 'Ja', desc: 'WhatsApp-Web-Provider-Info anzeigen.' },
    { method: 'GET', path: '/api/wwebjs/chats', auth: 'Ja', desc: 'Direkte WhatsApp-Chatliste vom Provider abrufen.' },
    { method: 'GET', path: '/api/wwebjs/chats/:chatId/messages', auth: 'Ja', desc: 'Direkte WhatsApp-Nachrichten vom Provider abrufen.' },
    { method: 'GET', path: '/uploads/safe/:file', auth: 'Ja', desc: 'Geprüfte Medien abrufen. App-Key per Query oder Header nötig.' },
    { method: 'WS', path: '/ws', auth: 'Ja', desc: 'Live-Verbindung für neue Nachrichten, ACK-Status, Anrufe und Sync-Events.' },
    { method: 'POST', path: '/provider/message', auth: 'Bridge', desc: 'Provider-Bridge: eingehende Nachricht importieren.' },
    { method: 'POST', path: '/provider/call', auth: 'Bridge', desc: 'Provider-Bridge: Anrufereignis importieren.' }
  ];
  const rows = docs.map((d) => `
        <tr>
          <td><span class="method ${htmlEscape(d.method).toLowerCase()}">${htmlEscape(d.method)}</span></td>
          <td><code>${htmlEscape(d.path)}</code></td>
          <td>${htmlEscape(d.auth)}</td>
          <td>${htmlEscape(d.desc)}</td>
        </tr>`).join('');

  const qrHtml = (() => {
    if (!canShowSecrets) {
      return `<div class="card wide"><h2>WhatsApp QR & App-Key</h2><p class="warn"><b>Geschützt:</b> QR-Code und App-Keys werden öffentlich nicht angezeigt. Öffne <code>/qr.php?setup=DEIN_SETUP_CODE</code> oder nutze lokal <code>http://127.0.0.1:${PORT}/</code>.</p></div>`;
    }
    const accountName = htmlEscape(selectedAccount?.name || selectedAccount?.id || 'main');
    const actions = `<p><a class="buttonlink" href="/qr.php?${selectedAccountQs}">QR-Seite fuer diesen Account öffnen</a><a class="buttonlink" href="/qr.php?${selectedAccountQs}&restart=1">Provider neu starten</a><a class="buttonlink danger" href="/qr.php?${selectedAccountQs}&reset=1" onclick="return confirm('WhatsApp-Session fuer diesen Account wirklich loeschen?')">Session loeschen & neuen QR erzeugen</a><a class="buttonlink" href="/qr.php?${adminQs ? `${adminQs}&` : ''}new=1">Neue WhatsApp-Nummer hinzufuegen</a></p>`;
    if (accountReady(selectedAccount)) {
      return `<div class="card wide"><h2>WhatsApp QR</h2><p class="ok">Account <b>${accountName}</b> ist verbunden.</p><p>Das bedeutet nur: Diese ausgewaehlte Nummer ist verbunden. Andere Nummern koennen parallel noch STARTING, QR oder ERROR sein.</p>${actions}</div>`;
    }
    if (!qrRaw) {
      return `<div class="card wide"><h2>WhatsApp QR</h2><p>Fuer Account <b>${accountName}</b> ist noch kein QR-Code vorhanden.</p><p>Status: <code>${htmlEscape(providerState)}</code></p>${selectedAccount?.provider?.lastError ? `<pre>${htmlEscape(selectedAccount.provider.lastError)}</pre>` : '<p class="hint">Wenn STARTING laenger stehen bleibt, nutze erst Provider neu starten, danach Session loeschen.</p>'}${actions}</div>`;
    }
    if (!QRCode) {
      return `<div class="card wide"><h2>WhatsApp QR</h2><p class="warn">Das Paket <code>qrcode</code> fehlt. Starte die BAT einmal neu, damit npm die Abhängigkeit installiert.</p><pre>${htmlEscape(qrRaw)}</pre>${actions}</div>`;
    }
    if (qrError) {
      return `<div class="card wide"><h2>WhatsApp QR</h2><p class="warn">QR konnte nicht als Bild erzeugt werden: ${htmlEscape(qrError)}</p><pre>${htmlEscape(qrRaw)}</pre>${actions}</div>`;
    }
    return `<div class="card wide"><h2>WhatsApp QR fuer ${accountName}</h2><p>In WhatsApp scannen: <b>Einstellungen → Verknüpfte Geräte → Gerät verknüpfen</b></p><div class="qrbox"><img src="${qrImage}" alt="WhatsApp QR-Code" /></div><p>QR wird neu erzeugt, wenn WhatsApp-Web ihn erneuert. Seite dann neu laden.</p>${actions}</div>`;
  })();

  const accountListHtml = accountManager.listSafe(canShowSecrets).map(a => {
    const rowQs = `${adminQs ? `${adminQs}&` : ''}account=${encodeURIComponent(a.id)}`;
    return `<tr><td><code>${htmlEscape(a.id)}</code></td><td>${htmlEscape(a.name)}</td><td><code>${htmlEscape(a.state || 'STARTING')}</code></td><td><code>${htmlEscape(a.appKey || a.appKeyPreview || '')}</code></td><td><a href="/qr.php?${rowQs}">QR</a> · <a href="/?${rowQs}">anzeigen</a></td></tr>`;
  }).join('');
  const appKeyHtml = canShowSecrets
    ? `<pre class="secret">${htmlEscape(selectedAccount?.appKey || 'Noch nicht erstellt. Erst QR scannen, dann erscheint hier der Key.')}</pre><p>Jede WhatsApp-Nummer nutzt ihren eigenen App-Key. In der Android-App entscheidet der eingetragene Key automatisch, welche WhatsApp-Nummer benutzt wird.</p><table><thead><tr><th>ID</th><th>Name</th><th>Status</th><th>App-Key</th><th>Aktion</th></tr></thead><tbody>${accountListHtml}</tbody></table>`
    : `<p class="warn"><b>Geschützt:</b> Der App-Key wird auf der öffentlichen Seite nicht angezeigt.</p>`;

  res.type('html').send(`<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Own Messenger API-Doku v${htmlEscape(VERSION)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Arial, Helvetica, sans-serif; background:#071015; color:#e9edef; }
    header { background:linear-gradient(135deg,#0b141a,#0a2f28); border-bottom:1px solid #17313a; padding:28px 18px; }
    main { max-width:1120px; margin:0 auto; padding:22px 18px 42px; }
    h1 { margin:0 0 8px; font-size:32px; }
    h2 { margin-top:0; color:#b6ffe0; }
    p { color:#b8c7cc; line-height:1.5; }
    .top { max-width:1120px; margin:0 auto; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin:16px 0; }
    .card { background:#111b21; border:1px solid #223039; border-radius:16px; padding:16px; box-shadow:0 10px 28px rgba(0,0,0,.22); }
    .wide { grid-column:1/-1; }
    .label { color:#8aa0a8; font-size:13px; margin-bottom:6px; }
    code, pre { background:#202c33; border:1px solid #2a3b44; border-radius:10px; color:#dff7ee; }
    code { padding:2px 6px; }
    pre { padding:14px; overflow:auto; white-space:pre-wrap; }
    .secret { font-size:18px; letter-spacing:.5px; user-select:all; }
    table { width:100%; border-collapse:collapse; overflow:hidden; border-radius:14px; background:#111b21; }
    th, td { padding:12px 10px; border-bottom:1px solid #223039; text-align:left; vertical-align:top; }
    th { color:#b6ffe0; background:#0e191f; }
    .method { display:inline-block; min-width:54px; text-align:center; padding:4px 8px; border-radius:999px; font-weight:bold; font-size:12px; background:#20313a; }
    .get { color:#88d8ff; } .post { color:#9dffb1; } .ws { color:#ffd36b; }
    .warn { border-left:4px solid #ffcc66; padding:12px 14px; background:#211d12; border-radius:10px; color:#ffdf9a; }
    a { color:#36d391; }
    .buttonlink { display:inline-block; margin:6px 8px 6px 0; border-radius:10px; padding:10px 12px; background:#36d391; color:#061016; font-weight:bold; text-decoration:none; }
    .buttonlink.danger { background:#ff6b6b; color:#170707; }
    .inlineform { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    select { min-width:260px; padding:10px; background:#202c33; border:1px solid #2a3b44; border-radius:10px; color:#dff7ee; }
    button { border:0; border-radius:10px; padding:10px 14px; background:#36d391; color:#061016; font-weight:bold; cursor:pointer; }
    .hint { font-size:14px; color:#91a4ac; }
    .ok { color:#36d391; font-weight:bold; }
    .qrbox { display:inline-flex; background:white; padding:14px; border-radius:18px; margin:8px 0; }
    .qrbox img { width:280px; height:280px; image-rendering:pixelated; display:block; }
  </style>
</head>
<body>
  <header>
    <div class="top">
      <h1>Own Messenger API-Doku</h1>
      <p>Server v${htmlEscape(VERSION)} · Status: <span class="ok">läuft</span> · Ausgewählter Account: <code>${htmlEscape(selectedAccount?.id || 'main')}</code> · Provider: <code>${htmlEscape(selectedProviderName)}</code></p>
    </div>
  </header>
  <main>
    <div class="grid">
      <div class="card"><div class="label">Base URL</div><code>${htmlEscape(baseUrl)}</code></div>
      <div class="card"><div class="label">WebSocket</div><code>${htmlEscape(wsUrl)}</code></div>
      <div class="card"><div class="label">App-Key Schutz</div><code>${htmlEscape(appKeyStatus)}</code></div>
      <div class="card"><div class="label">WhatsApp Status ausgewaehlt</div><code>${htmlEscape(providerState)}</code></div>
      ${rootAccountSwitcherHtml}
      ${qrHtml}
      <div class="card wide"><h2>App-Key</h2>${appKeyHtml}</div>
    </div>

    <div class="card wide">
      <h2>Android-App</h2>
      <p>In der App bei <b>Link / Server-URL</b> diese Adresse eintragen:</p>
      <pre>${htmlEscape(baseUrl)}</pre>
      <p>Den App-Key findest du auf dem Server in <code>APP_KEY.txt</code>. Diese Datei wie ein Passwort behandeln.</p>
    </div>

    <div class="card wide">
      <h2>Authentifizierung</h2>
      <p>Alle <code>/api</code>-, <code>/uploads</code>- und <code>/ws</code>-Routen brauchen den App-Key.</p>
      <pre>Authorization: Bearer DEIN_APP_KEY
x-app-key: DEIN_APP_KEY

Uploads/Medien alternativ:
${htmlEscape(baseUrl)}/uploads/safe/datei.jpg?key=DEIN_APP_KEY

WebSocket:
${htmlEscape(wsUrl)}?key=DEIN_APP_KEY</pre>
      <div class="warn"><b>Sicherheit:</b> Von außen nur HTTPS/WSS benutzen. Port 3000 soll nicht direkt öffentlich erreichbar sein. Öffentlich sollten nur Port 80 und 443 offen sein.</div>
    </div>

    <h2>Endpunkte</h2>
    <table>
      <thead><tr><th>Methode</th><th>Pfad</th><th>Key</th><th>Beschreibung</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>Beispiele</h2>
    <p>Status ohne Key:</p>
    <pre>curl ${htmlEscape(baseUrl)}/health</pre>
    <p>Bootstrap mit Key:</p>
    <pre>curl -H "Authorization: Bearer DEIN_APP_KEY" ${htmlEscape(baseUrl)}/api/bootstrap</pre>
    <p>Textnachricht senden:</p>
    <pre>curl -X POST ${htmlEscape(baseUrl)}/api/send \
  -H "Authorization: Bearer DEIN_APP_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"chatId\":\"491701234567@c.us\",\"text\":\"Hallo\"}"</pre>
    <p>Manueller Sync:</p>
    <pre>curl -X POST -H "Authorization: Bearer DEIN_APP_KEY" ${htmlEscape(baseUrl)}/api/sync/now</pre>

    <h2>PHP-Beispiele</h2>
    <p>Textnachricht mit PHP/cURL senden:</p>
    <pre>&lt;?php
$baseUrl = '${htmlEscape(baseUrl)}';
$appKey = 'DEIN_APP_KEY';

$payload = [
  'chatId' =&gt; '491701234567@c.us',
  'text' =&gt; 'Hallo von PHP'
];

$ch = curl_init($baseUrl . '/api/send');
curl_setopt_array($ch, [
  CURLOPT_POST =&gt; true,
  CURLOPT_RETURNTRANSFER =&gt; true,
  CURLOPT_HTTPHEADER =&gt; [
    'Authorization: Bearer ' . $appKey,
    'Content-Type: application/json'
  ],
  CURLOPT_POSTFIELDS =&gt; json_encode($payload, JSON_UNESCAPED_UNICODE)
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($response === false) {
  die('Fehler: ' . $error);
}

echo 'HTTP ' . $httpCode . PHP_EOL;
echo $response;
?&gt;</pre>

    <p>Bootstrap/Chats mit PHP abrufen:</p>
    <pre>&lt;?php
$baseUrl = '${htmlEscape(baseUrl)}';
$appKey = 'DEIN_APP_KEY';

$ch = curl_init($baseUrl . '/api/bootstrap');
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER =&gt; true,
  CURLOPT_HTTPHEADER =&gt; [
    'Authorization: Bearer ' . $appKey
  ]
]);

$response = curl_exec($ch);
curl_close($ch);

$data = json_decode($response, true);
print_r($data);
?&gt;</pre>

    <p>Bild/Datei mit PHP senden:</p>
    <pre>&lt;?php
$baseUrl = '${htmlEscape(baseUrl)}';
$appKey = 'DEIN_APP_KEY';
$filePath = __DIR__ . '/bild.jpg';

$payload = [
  'chatId' =&gt; '491701234567@c.us',
  'caption' =&gt; 'Bild von PHP',
  'file' =&gt; new CURLFile($filePath)
];

$ch = curl_init($baseUrl . '/api/media/send');
curl_setopt_array($ch, [
  CURLOPT_POST =&gt; true,
  CURLOPT_RETURNTRANSFER =&gt; true,
  CURLOPT_HTTPHEADER =&gt; [
    'Authorization: Bearer ' . $appKey
  ],
  CURLOPT_POSTFIELDS =&gt; $payload
]);

$response = curl_exec($ch);
curl_close($ch);
echo $response;
?&gt;</pre>

    <h2>Hinweise</h2>
    <p>Medien werden vor dem Bereitstellen geprüft, neu encodiert und in <code>uploads/safe</code> gespeichert. Blockierte Dateien landen in <code>uploads/quarantine</code>.</p>
  </main>
</body>
</html>`);
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    accounts: accountManager.listSafe(false),
    duplicateKeyRepairs,
    provider: provider?.name || null,
    providerReady: Boolean(provider?.ready),
    providerState: provider?.state || null,
    db: db?.dbFile || null,
    time: db?.nowSeconds ? db.nowSeconds() : Math.floor(Date.now()/1000)
  });
});


app.get('/api/accounts/me', (req, res) => {
  res.json({ ok: true, account: {
    ...accountPublicStatus(req.account),
    admin: Boolean(req.account.admin),
    appKeyPreview: req.account.appKey ? `${req.account.appKey.slice(0, 6)}…${req.account.appKey.slice(-6)}` : 'noch nicht erstellt'
  } });
});

app.get('/api/admin/accounts', requireAdminAccount, (req, res) => {
  res.json({ ok: true, accounts: accountManager.listSafe(true), accountsFile: accountManager.accountsFile });
});

app.post('/api/admin/accounts', requireAdminAccount, async (req, res) => {
  try {
    const account = accountManager.addAccount({
      id: req.body.id,
      name: req.body.name,
      provider: req.body.provider,
      admin: req.body.admin === true,
      appKey: req.body.appKey || req.body.app_key
    });
    attachProviderEvents(account);
    await account.provider.start();
    res.json({ ok: true, account: { id: account.id, name: account.name, appKey: account.appKey, provider: account.provider.name, state: account.provider.state || null } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/api/admin/accounts/:accountId/sync', requireAdminAccount, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.syncChatsAndMessages !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann keinen Sync.' });
  const result = await account.provider.syncChatsAndMessages('admin_manual');
  broadcastToAccount(account, 'sync', account.db.getBootstrap());
  res.json({ ok: true, result });
});

app.post('/api/admin/accounts/:accountId/restart', requireAdminAccount, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.restart !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann keinen Restart.' });
  lastWhatsAppQrByAccount.delete(account.id);
  await account.provider.restart();
  res.json({ ok: true, account: { id: account.id, name: account.name, state: accountStatusText(account) } });
});

app.post('/api/admin/accounts/:accountId/reset-session', requireAdminAccount, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.resetSession !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann Session nicht loeschen.' });
  lastWhatsAppQrByAccount.delete(account.id);
  await account.provider.resetSession();
  res.json({ ok: true, account: { id: account.id, name: account.name, state: accountStatusText(account) } });
});


function requireLocalControl(req, res, next) {
  if (isLoopbackRequest(req)) return next();
  return res.status(403).json({ ok: false, error: 'Lokales Kontrollpanel ist nur auf 127.0.0.1 erlaubt.' });
}

function safeAccountStatus(account, showSecrets = false) {
  return {
    id: account.id,
    name: account.name,
    ready: accountReady(account),
    state: accountStatusText(account),
    hasQr: Boolean(getQrPayloadForAccount(account)?.qr),
    hasSession: typeof account.provider?.hasSession === 'function' ? account.provider.hasSession() : undefined,
    appKeyReady: Boolean(account.appKey && account.appKey.length >= 32),
    appKey: showSecrets ? (account.appKey || '') : undefined,
    lastPairingCode: showSecrets ? (account.provider?.lastPairingCode || '') : undefined,
    lastPairingPhone: showSecrets ? (account.provider?.lastPairingPhone || '') : undefined,
    lastError: account.provider?.lastError || account.provider?.lastPairingError || account.provider?.lastSyncError || ''
  };
}

app.get('/api/local/control/status', requireLocalControl, (_req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    maxWaAccounts: accountManager.maxWaAccounts || 5,
    setupCode: SETUP_CODE,
    accounts: accounts.map(a => safeAccountStatus(a, true)),
    time: Math.floor(Date.now() / 1000)
  });
});

app.post('/api/local/accounts/:accountId/start', requireLocalControl, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.start !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann nicht gestartet werden.' });
  await account.provider.start();
  res.json({ ok: true, account: safeAccountStatus(account, true) });
});

app.post('/api/local/accounts/:accountId/stop', requireLocalControl, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.stop !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann nicht gestoppt werden.' });
  await account.provider.stop();
  res.json({ ok: true, account: safeAccountStatus(account, true) });
});

app.post('/api/local/accounts/:accountId/restart', requireLocalControl, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.restart !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann nicht neu gestartet werden.' });
  lastWhatsAppQrByAccount.delete(account.id);
  await account.provider.restart();
  res.json({ ok: true, account: safeAccountStatus(account, true) });
});

app.post('/api/local/accounts/:accountId/reset-session', requireLocalControl, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.resetSession !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann Session nicht loeschen.' });
  lastWhatsAppQrByAccount.delete(account.id);
  await account.provider.resetSession();
  res.json({ ok: true, account: safeAccountStatus(account, true) });
});

app.post('/api/local/accounts/:accountId/pairing-code', requireLocalControl, async (req, res) => {
  const account = accounts.find(a => a.id === req.params.accountId);
  if (!account) return res.status(404).json({ ok: false, error: 'Account nicht gefunden.' });
  if (typeof account.provider.requestPairingCode !== 'function') return res.status(400).json({ ok: false, error: 'Provider kann keinen Pairing-Code erzeugen.' });
  try {
    const code = await account.provider.requestPairingCode(req.body?.phone || req.query.phone || '');
    res.json({ ok: true, code, account: safeAccountStatus(account, true) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || String(error), account: safeAccountStatus(account, true) });
  }
});

app.get('/api/security/status', (req, res) => {
  res.json({ ok: true, account: { id: req.account.id, name: req.account.name }, security: accessSecurity.getStatus(req.account.id) });
});

app.get('/api/bootstrap', (req, res) => {
  res.json({ ...req.db.getBootstrap(), account: { id: req.account.id, name: req.account.name } });
});


app.get('/api/sync/status', (req, res) => {
  const rprovider = req.provider;
  const status = typeof rprovider.getSyncStatus === 'function'
    ? rprovider.getSyncStatus()
    : { provider: rprovider.name, ready: Boolean(rprovider.ready), state: rprovider.state || null };
  res.json({ ok: true, account: { id: req.account.id, name: req.account.name }, sync: status, chatCount: req.db.listChats().length });
});

app.post('/api/sync/now', async (req, res) => {
  const rprovider = req.provider;
  if (typeof rprovider.syncChatsAndMessages !== 'function') {
    return res.status(400).json({ ok: false, error: 'Provider kann keinen Chat-Sync starten.' });
  }
  try {
    const result = await rprovider.syncChatsAndMessages('api_manual');
    broadcastToAccount(req.account, 'sync', req.db.getBootstrap());
    res.json({ ok: true, account: { id: req.account.id, name: req.account.name }, result, chatCount: req.db.listChats().length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/chats', (req, res) => {
  res.json({ ok: true, chats: req.db.listChats() });
});

app.get('/api/chats/:chatId/messages', (req, res) => {
  res.json({ ok: true, messages: req.db.listMessages(req.params.chatId, Number(req.query.limit || 300)) });
});

app.get('/api/messages', (req, res) => {
  res.json({ ok: true, messagesByChat: req.db.listAllMessages(300) });
});

app.get('/api/calls', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100) || 100, 500);
  res.json({ ok: true, data: req.db.listCalls(limit) });
});


function mimeToMessageType(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.startsWith('image/')) return 'image';
  if (value.startsWith('video/')) return 'video';
  if (value.startsWith('audio/')) return 'audio';
  return 'document';
}

function fileBody(type, fileName, caption) {
  const text = sanitizeText(caption);
  if (text) return text;
  if (type === 'image') return '[Bild]';
  if (type === 'video') return '[Video]';
  if (type === 'audio') return '[Audio]';
  return fileName ? `[Datei: ${fileName}]` : '[Datei]';
}

async function handleSend(req, res) {
  try {
    const to = normalizeChatId(req.body.to || req.body.chatId || req.body.chat_id);
    const chatId = normalizeChatId(req.body.chatId || req.body.chat_id || req.body.to);
    const text = sanitizeText(req.body.text || req.body.body || req.body.message);

    if (!to || !chatId || !text) {
      return res.status(400).json({ ok: false, error: 'to/chatId/text are required' });
    }

    const result = await req.provider.sendMessage({ to, chatId, text, raw: req.body });
    const message = req.db.insertMessage({
      id: result.id || `out_${randomUUID()}`,
      providerMessageId: result.providerMessageId || result.id || null,
      chatId: result.chatId || chatId,
      senderName: result.senderName || 'Ich',
      senderId: result.senderId || null,
      senderNumber: result.senderNumber || null,
      chatName: result.chatName || null,
      body: text,
      direction: 'out',
      type: req.body.type || 'text',
      timestamp: result.timestamp || req.db.nowSeconds(),
      status: result.status || 'sent',
      raw: { request: req.body, providerResult: result }
    });

    broadcastToAccount(req.account, 'message.new', message);
    return res.json({ ok: true, account: accountPublicStatus(req.account), data: message, provider: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

app.post('/api/send', handleSend);
app.post('/api/messages/send', handleSend);

app.post('/api/media/send', upload.single('file'), async (req, res) => {
  try {
    const to = normalizeChatId(req.body.to || req.body.chatId || req.body.chat_id);
    const chatId = normalizeChatId(req.body.chatId || req.body.chat_id || req.body.to);
    if (!to || !chatId) return res.status(400).json({ ok: false, error: 'to/chatId are required' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'file is required' });

    const secure = await sanitizeMediaFile(req.file.path, {
      source: 'app_upload',
      originalName: req.file.originalname,
      claimedMime: req.file.mimetype
    });

    if (secure.blocked || !secure.ok) {
      return res.status(400).json({
        ok: false,
        error: 'Datei wurde aus Sicherheitsgruenden blockiert.',
        scan: secure
      });
    }

    const type = sanitizeText(req.body.type) || secure.messageType || messageTypeForMime(secure.mimeType);
    const mediaUrl = secure.mediaUrl;
    const body = fileBody(type, req.file.originalname, req.body.caption || req.body.text || '');

    let providerResult = null;
    try {
      providerResult = await req.provider.sendMessage({
        to,
        chatId,
        text: body,
        raw: {
          ...req.body,
          type,
          caption: req.body.caption || req.body.text || '',
          mediaPath: secure.safePath,
          filePath: secure.safePath,
          mimeType: secure.mimeType,
          fileName: secure.safeName,
          originalFileName: req.file.originalname,
          upload: {
            path: secure.safePath,
            filename: secure.safeName,
            originalname: req.file.originalname,
            mimetype: secure.mimeType,
            size: secure.fileSize,
            mediaUrl,
            scan: secure
          }
        }
      });
    } catch (error) {
      return res.status(500).json({ ok: false, error: `Provider media send failed: ${error.message}`, localMediaUrl: mediaUrl, scan: secure });
    }

    const message = req.db.insertMessage({
      id: providerResult?.id || `media_${randomUUID()}`,
      providerMessageId: providerResult?.providerMessageId || providerResult?.id || null,
      chatId: providerResult?.chatId || chatId,
      to,
      senderName: providerResult?.senderName || 'Ich',
      senderId: providerResult?.senderId || null,
      senderNumber: providerResult?.senderNumber || null,
      chatName: providerResult?.chatName || null,
      body,
      direction: 'out',
      type,
      timestamp: providerResult?.timestamp || req.db.nowSeconds(),
      status: providerResult?.status || 'sent',
      mediaUrl,
      fileName: req.file.originalname,
      mimeType: secure.mimeType,
      fileSize: secure.fileSize,
      scanStatus: secure.scanStatus,
      scanResult: secure.scanResult,
      originalFileName: req.file.originalname,
      originalMimeType: req.file.mimetype,
      raw: {
        request: req.body,
        providerResult,
        upload: {
          path: secure.safePath,
          filename: secure.safeName,
          originalname: req.file.originalname,
          mimetype: secure.mimeType,
          size: secure.fileSize,
          mediaUrl,
          scan: secure
        }
      }
    });

    broadcastToAccount(req.account, 'message.new', message);
    res.json({ ok: true, account: accountPublicStatus(req.account), data: message, provider: providerResult, scan: secure });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});


app.post('/api/messages/:messageId/status', (req, res) => {
  const status = sanitizeText(req.body.status || req.body.ack);
  if (!status) return res.status(400).json({ ok: false, error: 'status is required' });

  const message = req.db.updateMessageStatus(req.params.messageId, status);
  broadcastToAccount(req.account, 'message.status', { id: req.params.messageId, messageId: req.params.messageId, status });
  res.json({ ok: true, data: message || { id: req.params.messageId, status } });
});

app.post('/api/chats/:chatId/read', (req, res) => {
  const chat = req.db.getChat(req.params.chatId);
  if (!chat) return res.status(404).json({ ok: false, error: 'Chat not found' });
  const updated = req.db.upsertChat({ ...chat, unreadCount: 0, lastTimestamp: chat.lastTimestamp });
  broadcastToAccount(req.account, 'chat.update', updated);
  res.json({ ok: true, data: updated });
});


// wwebjs-compatible demo API. This intentionally does not connect to WhatsApp Web.
// It mimics the public concepts of whatsapp-web.js for app/server testing.
app.get('/api/wwebjs/info', async (req, res) => {
  const p = req.provider;
  const client = p.client || null;
  res.json({
    ok: true,
    account: { id: req.account.id, name: req.account.name },
    provider: p.name,
    hasDemoClient: Boolean(client),
    qrLogin: false,
    state: client ? await client.getState() : 'NO_CLIENT',
    wwebVersion: client ? await client.getWWebVersion() : null,
    info: client?.info || null
  });
});

app.post('/api/wwebjs/start', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const p = req.provider;
  if (!p.ready) await p.start();
  broadcastToAccount(req.account, 'authenticated', { provider: p.name, qrLogin: false });
  broadcastToAccount(req.account, 'ready', { provider: p.name, ready: true, qrLogin: false });
  res.json({ ok: true, state: await client.getState(), qrLogin: false });
});

app.get('/api/wwebjs/chats', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const chats = await client.getChats();
  res.json({ ok: true, chats: await Promise.all(chats.map(serializeChat)) });
});

app.get('/api/wwebjs/chats/:chatId/messages', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const chat = await client.getChatById(req.params.chatId);
  const messages = await chat.fetchMessages({ limit: Number(req.query.limit || 50) });
  res.json({ ok: true, chat: await serializeChat(chat), messages: messages.map(serializeMessage) });
});

app.post('/api/wwebjs/chats/:chatId/send', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const content = req.body.content || req.body.text || req.body.body || '';
  const message = await client.sendMessage(req.params.chatId, content, req.body.options || {});
  broadcastToAccount(req.account, 'message.new', req.db.getMessage(message.id._serialized));
  res.json({ ok: true, message: serializeMessage(message) });
});

app.post('/api/wwebjs/chats/:chatId/seen', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const result = await client.sendSeen(req.params.chatId);
  const chat = req.db.getChat(toWwebJid(req.params.chatId)) || req.db.getChat(req.params.chatId);
  broadcastToAccount(req.account, 'chat.update', chat);
  res.json({ ok: true, result, chat });
});

for (const action of ['archive', 'unarchive', 'pin', 'unpin', 'mute', 'unmute']) {
  app.post(`/api/wwebjs/chats/:chatId/${action}`, async (req, res) => {
    const client = requireDemoClient(req, res);
    if (!client) return;
    const chat = await client.getChatById(req.params.chatId);
    const result = await chat[action](req.body?.unmuteDate ? new Date(req.body.unmuteDate) : undefined);
    const updated = req.db.getChat(chat.id._serialized);
    broadcastToAccount(req.account, 'chat.update', updated);
    res.json({ ok: true, result, chat: updated });
  });
}

app.post('/api/wwebjs/demo/create-chat', async (req, res) => {
  const id = toWwebJid(req.body.chatId || req.body.id || req.body.number || req.body.phone || `49170000${Math.floor(Math.random() * 9999)}`);
  const chat = req.db.upsertChat({
    id,
    name: req.body.name || id.replace(/@c\.us$|@g\.us$/g, ''),
    lastMessage: req.body.lastMessage || '',
    lastTimestamp: req.body.timestamp || req.db.nowSeconds(),
    unreadCount: req.body.unreadCount || 0,
    isGroup: req.body.isGroup || id.endsWith('@g.us'),
    avatarUrl: req.body.avatarUrl || null
  });
  broadcastToAccount(req.account, 'chat.update', chat);
  res.json({ ok: true, chat });
});

app.post('/api/wwebjs/demo/incoming-message', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const message = await client.__demoIncomingMessage(req.body);
  const saved = req.db.getMessage(message.id._serialized);
  res.json({ ok: true, message: serializeMessage(message), data: saved });
});

app.post('/api/wwebjs/demo/incoming-call', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const call = await client.__demoIncomingCall(req.body);
  res.json({ ok: true, call });
});

app.post('/api/wwebjs/demo/seed-whatsapp-like', async (req, res) => {
  const client = requireDemoClient(req, res);
  if (!client) return;
  const now = req.db.nowSeconds();
  const chats = [
    { id: '491701234567@c.us', name: 'Max Test', lastMessage: 'Bist du da?', lastTimestamp: now - 60, unreadCount: 2 },
    { id: '491702222222@c.us', name: 'Lisa Demo', lastMessage: 'Bild angekommen 👍', lastTimestamp: now - 300, unreadCount: 0 },
    { id: 'demo_group_123@g.us', name: 'Testgruppe', lastMessage: 'Willkommen in der Gruppe', lastTimestamp: now - 900, unreadCount: 1, isGroup: true }
  ];
  for (const chat of chats) req.db.upsertChat(chat);
  await client.__demoIncomingMessage({ from: '491701234567@c.us', name: 'Max Test', text: 'Hey, das ist wie ein wwebjs message Event.' });
  await client.sendMessage('491701234567@c.us', 'Antwort aus deinem Demo-Client');
  await client.__demoIncomingMessage({ from: '491702222222@c.us', name: 'Lisa Demo', text: 'Medien und Chats laufen über deine DB.' });
  await client.__demoIncomingMessage({ from: 'demo_group_123@g.us', name: 'Testgruppe', text: 'Gruppennachricht im Demo-Provider.' });
  const bootstrap = req.db.getBootstrap();
  broadcastToAccount(req.account, 'sync', bootstrap);
  res.json({ ok: true, data: bootstrap });
});

// Provider-neutral bridge endpoints.
// A separate provider process can POST here and the Android app receives live events via /ws.

app.post('/provider/chats', (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : (req.body.chats || []);
    if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'chats must be an array' });

    const saved = items.map((item) => {
      const chat = db.upsertChat({
        id: item.id || item.chatId || item._serialized,
        name: item.name || item.formattedTitle || item.pushname || item.id || item.chatId,
        lastMessage: item.lastMessage || item.last_message || item.lastBody || item.body || '',
        lastTimestamp: item.lastTimestamp || item.timestamp || item.t || db.nowSeconds(),
        unreadCount: item.unreadCount || item.unread_count || 0,
        isGroup: item.isGroup || item.is_group || String(item.id || item.chatId || '').endsWith('@g.us'),
        muted: item.muted || item.isMuted || false,
        pinned: item.pinned || false,
        archived: item.archived || false,
        avatarUrl: item.avatarUrl || item.avatar_url || null
      });
      broadcast('chat.update', chat);
      return chat;
    });

    broadcast('sync', db.getBootstrap());
    res.json({ ok: true, count: saved.length, chats: saved });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/provider/message', (req, res) => {
  try {
    const message = incomingMessageFromPayload(req.body, db);
    broadcast('message.new', message);
    const call = maybeStoreCallFromMessage({ ...req.body, ...message }, db);
    if (call) broadcast('incoming_call', call);
    res.json({ ok: true, data: message, call });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/provider/messages', (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : (req.body.messages || []);
    const saved = items.map((item) => {
      const message = incomingMessageFromPayload(item);
      broadcast('message.new', message);
      const call = maybeStoreCallFromMessage({ ...item, ...message }, db);
      if (call) broadcast('incoming_call', call);
      return message;
    });
    res.json({ ok: true, data: saved });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/provider/message-status', (req, res) => {
  try {
    const id = req.body.id || req.body.messageId || req.body.providerMessageId || req.body.waMessageId;
    const status = req.body.status || req.body.ack;
    if (!id || !status) return res.status(400).json({ ok: false, error: 'id/messageId and status are required' });
    const message = db.updateMessageStatus(id, status);
    broadcast('message.status', { id, messageId: id, status, raw: req.body });
    res.json({ ok: true, data: message || { id, status } });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/provider/call', (req, res) => {
  try {
    const call = callFromPayload(req.body);
    logIncomingCall(call, req);
    broadcast('incoming_call', call);
    res.json({ ok: true, data: call });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/provider/status', (req, res) => {
  try {
    const status = db.upsertStatus({
      id: req.body.id || req.body.statusId || `status_${randomUUID()}`,
      name: req.body.name || req.body.contact_name || req.body.from || 'Status',
      timestamp: req.body.timestamp || db.nowSeconds(),
      viewed: req.body.viewed || false,
      isMine: req.body.isMine || req.body.is_mine || false,
      raw: req.body
    });
    broadcast('status.new', status);
    res.json({ ok: true, data: status });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/provider/qr', (req, res) => {
  broadcast('qr', req.body);
  res.json({ ok: true });
});

app.post('/provider/ready', (req, res) => {
  broadcast('ready', req.body);
  res.json({ ok: true });
});

// Local development aliases. These work even when PROVIDER=mock.
app.post('/dev/incoming-message', (req, res) => {
  try {
    const message = incomingMessageFromPayload(req.body, req.db);
    broadcastToAccount(req.account, 'message.new', message);
    res.json({ ok: true, data: message });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/dev/incoming-call', (req, res) => {
  try {
    const call = callFromPayload(req.body, req.db);
    broadcastToAccount(req.account, 'incoming_call', call);
    res.json({ ok: true, data: call });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/dev/status', (req, res) => {
  try {
    const status = req.db.upsertStatus({
      id: req.body.id || `status_${randomUUID()}`,
      name: req.body.name || req.body.contact_name || req.body.from || 'Status',
      timestamp: req.body.timestamp || req.db.nowSeconds(),
      viewed: req.body.viewed || false,
      isMine: req.body.isMine || req.body.is_mine || false,
      raw: req.body
    });
    broadcastToAccount(req.account, 'status.new', status);
    res.json({ ok: true, data: status });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post('/dev/seed', (req, res) => {
  req.db.seedDemoData();
  const bootstrap = req.db.getBootstrap();
  broadcastToAccount(req.account, 'sync', bootstrap);
  res.json({ ok: true, data: bootstrap });
});

app.post('/dev/reset', (req, res) => {
  req.db.resetDatabase();
  const bootstrap = req.db.getBootstrap();
  broadcastToAccount(req.account, 'sync', bootstrap);
  res.json({ ok: true });
});

wss.on('connection', (ws, req) => {
  if (REQUIRE_HTTPS && !requestIsHttps(req) && !isLoopbackRequest(req)) {
    accessSecurity.audit('ws_https_required_blocked', req);
    ws.close(1008, 'HTTPS required');
    return;
  }

  const requestUrl = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
  const token = (requestUrl.searchParams.get('key') || requestUrl.searchParams.get('token') || req.headers['x-app-key'] || bearer(req) || '').toString().trim();
  req.originalUrl = req.url;
  req.query = Object.fromEntries(requestUrl.searchParams.entries());
  const account = accountManager.getByToken(token);
  if (!account) {
    recordAuthFailure(req);
    accessSecurity.audit('ws_auth_failed_bad_key', req);
    ws.close(1008, 'Unauthorized');
    return;
  }
  req.account = account;
  req.db = account.db;
  req.provider = account.provider;

  const deviceCheck = accessSecurity.verifySingleDevice(req, account.id);
  if (!deviceCheck.ok) {
    triggerSecurityLockdown(deviceCheck.code || 'ws_device_check_failed', req, { accountId: account.id });
    ws.close(4001, deviceCheck.code || 'Security lockdown');
    return;
  }
  accessSecurity.audit(deviceCheck.firstUse ? 'ws_auth_ok_first_device_bound' : 'ws_auth_ok', req, { accountId: account.id });

  const set = getAccountSockets(account.id);
  set.add(ws);
  sendToSocket(ws, 'sync', account.db.getBootstrap());
  sendToSocket(ws, 'ready', { provider: account.provider.name, version: VERSION, account: { id: account.id, name: account.name } });

  ws.on('message', (raw) => {
    let msg = null;
    try { msg = JSON.parse(raw.toString()); } catch (_) {}
    if (!msg) return;

    if (msg.event === 'ping') {
      sendToSocket(ws, 'pong', { time: account.db.nowSeconds(), accountId: account.id });
    }
  });

  ws.on('close', () => set.delete(ws));
  ws.on('error', () => set.delete(ws));
});

function attachProviderEvents(account) {
  const p = account.provider;
  const adb = account.db;
  p.on('ready', (data) => {
    lastWhatsAppQrByAccount.delete(account.id);
    const connectedWid = p.connectedWid || data?.wid || data?.me || '';
    const duplicate = connectedWid ? accounts.find(other => other.id !== account.id && (other.provider?.connectedWid || '') === connectedWid) : null;
    if (duplicate) {
      p.lastError = `Warnung: Dieser Slot ist mit derselben WhatsApp-Nummer verbunden wie ${duplicate.id}. Wenn du verschiedene Nummern willst, in diesem Slot Session loeschen und mit der richtigen Nummer neu koppeln.`;
      console.warn(`[accounts:${account.id}] ${p.lastError}`);
    }
    if (!account.appKey || account.appKey.length < 32) {
      const newKey = accountManager.ensureAppKey(account);
      console.log(`[security:${account.id}] WhatsApp verbunden: App-Key wurde jetzt erstellt.`);
      if (account.id === defaultAccount?.id) writeAppKeyFile();
      broadcastToAccount(account, 'app_key.created', { accountId: account.id, created: true });
    }
    broadcastToAccount(account, 'ready', { ...data, accountId: account.id, accountName: account.name });
    broadcastToAccount(account, 'sync', adb.getBootstrap());
  });
  p.on('qr', (data = {}) => {
    const payload = { ...data, qr: data.qr || p.lastQrRaw || '', timestamp: data.timestamp || Math.floor(Date.now() / 1000) };
    if (payload.qr) lastWhatsAppQrByAccount.set(account.id, payload);
    broadcastToAccount(account, 'qr', { ...payload, accountId: account.id, accountName: account.name });
  });
  p.on('pairing_code', (data = {}) => {
    broadcastToAccount(account, 'pairing_code', { ...data, accountId: account.id, accountName: account.name });
  });
  p.on('message', (data) => {
    const id = data?.id || data?.messageId || data?.providerMessageId || data?.waMessageId;
    if (id && adb.getMessage(id)) return;
    const message = adb.insertMessage(data);
    broadcastToAccount(account, 'message.new', message);
    const call = maybeStoreCallFromMessage({ ...data, ...message }, adb);
    if (call) broadcastToAccount(account, 'incoming_call', call);
  });
  p.on('chats', (payload) => {
    const items = Array.isArray(payload) ? payload : (payload?.chats || []);
    const saved = [];
    for (const item of items) {
      try {
        const chat = adb.upsertChat({
          id: item.id || item.chatId || item._serialized,
          name: item.name || item.formattedTitle || item.pushname || item.id || item.chatId,
          lastMessage: item.lastMessage || item.last_message || item.lastBody || item.body || '',
          lastTimestamp: item.lastTimestamp || item.timestamp || item.t || adb.nowSeconds(),
          unreadCount: item.unreadCount || item.unread_count || 0,
          isGroup: item.isGroup || item.is_group || String(item.id || item.chatId || '').endsWith('@g.us'),
          muted: item.muted || item.isMuted || false,
          pinned: item.pinned || false,
          archived: item.archived || false,
          avatarUrl: item.avatarUrl || item.avatar_url || null
        });
        saved.push(chat);
        broadcastToAccount(account, 'chat.update', chat);
      } catch (error) {
        console.log(`[provider.chats:${account.id}] import failed:`, error.message);
      }
    }
    if (saved.length) broadcastToAccount(account, 'sync', adb.getBootstrap());
  });
  p.on('messages', (payload) => {
    const items = Array.isArray(payload) ? payload : (payload?.messages || []);
    const saved = [];
    let skipped = 0;
    for (const item of items) {
      try {
        const id = item.id || item.messageId || item.providerMessageId || item.waMessageId || item.provider_message_id || item.wa_message_id;
        if (id && adb.getMessage(id)) { skipped += 1; continue; }
        const message = adb.insertMessage(item);
        saved.push(message);
        broadcastToAccount(account, 'message.new', message);
        const call = maybeStoreCallFromMessage({ ...item, ...message }, adb);
        if (call) broadcastToAccount(account, 'incoming_call', call);
      } catch (error) {
        console.log(`[provider.messages:${account.id}] import failed:`, error.message);
      }
    }
    if (saved.length) broadcastToAccount(account, 'sync', adb.getBootstrap());
    if (saved.length || skipped) console.log(`[provider.messages:${account.id}] ${saved.length} neu, ${skipped} schon vorhanden.`);
  });
  p.on('message_ack', (data) => {
    const id = data.id || data.messageId || data.providerMessageId;
    if (!id) return;
    adb.updateMessageStatus(id, data.status || data.ack);
    broadcastToAccount(account, 'message.status', data);
  });
  p.on('incoming_call', (data) => {
    const call = adb.insertCall(data);
    logIncomingCall(call);
    broadcastToAccount(account, 'incoming_call', call);
    broadcastToAccount(account, 'sync', adb.getBootstrap());
  });
  p.on('status', (data) => {
    const status = adb.upsertStatus(data);
    broadcastToAccount(account, 'status.new', status);
  });
  p.on('chat_update', (data) => {
    const chat = typeof data?.id === 'object' ? adb.getChat(data.id._serialized) : data;
    broadcastToAccount(account, 'chat.update', chat);
  });
  p.on('chat_archived', (data) => broadcastToAccount(account, 'chat.archived', data));
  p.on('authenticated', (data) => {
    lastWhatsAppQrByAccount.delete(account.id);
    if (!account.appKey || account.appKey.length < 32) {
      const newKey = accountManager.ensureAppKey(account);
      console.log(`[security:${account.id}] QR gescannt/authentifiziert: App-Key wurde jetzt erstellt.`);
      if (account.id === defaultAccount?.id) writeAppKeyFile();
    }
    broadcastToAccount(account, 'authenticated', data);
  });
  p.on('disconnected', (data) => broadcastToAccount(account, 'disconnected', data));
}

for (const account of accounts) attachProviderEvents(account);

function getLanUrls() {
  const urls = [];
  const nets = os.networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${PORT}`);
      }
    }
  }
  return urls;
}

async function start() {
  const staggerMs = Math.max(0, Number(process.env.WWEBJS_START_STAGGER_MS || 8000));
  const autoStartEmptySecondary = String(process.env.WA_AUTOSTART_EMPTY_SLOTS || process.env.WWEBJS_AUTOSTART_EMPTY_SECONDARY || '0') === '1';
  const accountsToStart = [];
  for (const account of accounts) {
    const isDefault = account.id === defaultAccount?.id;
    const hasSession = typeof account.provider?.hasSession === 'function' ? account.provider.hasSession() : true;
    const shouldStart = isDefault || hasSession || autoStartEmptySecondary;
    if (shouldStart) {
      accountsToStart.push(account);
    } else if (typeof account.provider?.setNotStarted === 'function') {
      account.provider.setNotStarted('Leerer WhatsApp-Slot. Im QR-Setup einzeln starten, wenn diese Nummer gekoppelt werden soll.');
    } else if (account.provider) {
      account.provider.state = 'NOT_STARTED';
    }
  }

  for (let index = 0; index < accountsToStart.length; index += 1) {
    const account = accountsToStart[index];
    await account.provider.start();
    if (staggerMs && index < accountsToStart.length - 1) {
      console.log(`[server] Warte ${Math.round(staggerMs / 1000)}s vor Start des naechsten verbundenen WhatsApp-Accounts ...`);
      await sleep(staggerMs);
    }
  }
  server.listen(PORT, HOST, () => {
    const lanUrls = getLanUrls();
    console.log('');
    console.log('============================================================');
    console.log(`OwnMessengerServer v${VERSION} laeuft`);
    console.log('============================================================');
    console.log(`Lokal am PC:       http://localhost:${PORT}`);
    console.log(`Host Binding:      ${HOST}:${PORT}`);
    console.log(`Accounts:          ${accounts.length} (max. ${accountManager.maxWaAccounts || 5} WhatsApp-Slots, ${accountsToStart.length} automatisch gestartet)`);
    for (const account of accounts) {
      const hasSession = typeof account.provider?.hasSession === 'function' ? account.provider.hasSession() : 'n/a';
      console.log(`  - ${account.id}: ${account.name} | ${account.provider.name} | Status=${accountStatusText(account)} | Session=${hasSession} | ClientId=${account.clientId} | DB=${account.db.dbFile}`);
    }
    console.log(`Ein-Geraet-Schutz: ${process.env.APP_KEY_SINGLE_DEVICE === '0' ? 'aus' : 'aktiv'}`);
    console.log(`Security-Log:      ${accessSecurity.AUDIT_FILE}`);
    console.log('');
    console.log('Android-App im gleichen WLAN, eine dieser URLs probieren:');
    if (lanUrls.length) {
      for (const url of lanUrls) console.log(`  ${url}`);
    } else {
      console.log('  Keine LAN-IP gefunden. Pruefe WLAN/LAN-Verbindung.');
    }
    console.log('');
    console.log('Android Emulator:  http://10.0.2.3:' + PORT);
    console.log('Test im Handy-Browser: /health anhaengen, z.B. http://IP:' + PORT + '/health');
    console.log('============================================================');
    console.log('');
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
