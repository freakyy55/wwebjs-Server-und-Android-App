const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const Database = require('better-sqlite3');

const projectRoot = path.resolve(__dirname, '..');

function resolveDbPath(dbPath) {
  const selected = dbPath || './data/own_messenger.sqlite';
  return path.isAbsolute(selected) ? selected : path.join(projectRoot, selected);
}

const dbFile = resolveDbPath(process.env.DB_PATH || process.env.DB_FILE);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_message TEXT DEFAULT '',
      last_timestamp INTEGER NOT NULL,
      unread_count INTEGER DEFAULT 0,
      is_group INTEGER DEFAULT 0,
      muted INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      archived INTEGER DEFAULT 0,
      online INTEGER DEFAULT 0,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      sender_name TEXT,
      sender_id TEXT,
      sender_number TEXT,
      chat_name TEXT,
      body TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('in','out')),
      type TEXT NOT NULL DEFAULT 'text',
      timestamp INTEGER NOT NULL,
      status TEXT,
      provider_message_id TEXT,
      media_url TEXT,
      file_name TEXT,
      mime_type TEXT,
      file_size INTEGER,
      scan_status TEXT,
      scan_result TEXT,
      original_file_name TEXT,
      original_mime_type TEXT,
      raw_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON messages(provider_message_id);

    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      viewed INTEGER DEFAULT 0,
      is_mine INTEGER DEFAULT 0,
      raw_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      name TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'in',
      missed INTEGER DEFAULT 0,
      is_video INTEGER DEFAULT 0,
      timestamp INTEGER NOT NULL,
      raw_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const columns = db.prepare(`PRAGMA table_info(messages)`).all().map((row) => row.name);
  const addColumn = (name, definition) => {
    if (!columns.includes(name)) db.exec(`ALTER TABLE messages ADD COLUMN ${name} ${definition}`);
  };
  addColumn('media_url', 'TEXT');
  addColumn('file_name', 'TEXT');
  addColumn('mime_type', 'TEXT');
  addColumn('file_size', 'INTEGER');
  addColumn('sender_id', 'TEXT');
  addColumn('sender_number', 'TEXT');
  addColumn('chat_name', 'TEXT');
  addColumn('scan_status', 'TEXT');
  addColumn('scan_result', 'TEXT');
  addColumn('original_file_name', 'TEXT');
  addColumn('original_mime_type', 'TEXT');
  ensureColumn('chats', 'archived', 'INTEGER DEFAULT 0');
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function asBoolInt(value) {
  return value ? 1 : 0;
}

function toBool(value) {
  return value === 1 || value === true;
}

function normalizeTimestamp(value) {
  const n = Number(value || nowSeconds());
  return n > 100_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
}

function json(value) {
  try {
    return JSON.stringify(value || {});
  } catch (_) {
    return JSON.stringify({ serializationError: true });
  }
}

function upsertChat(input) {
  const id = String(input.id || input.chatId || input.chat_id || input.contact_wa_id || input.wa_id || input.from || input.to || '').trim();
  if (!id) throw new Error('Chat id is required');

  const existing = getChat(id);
  const timestamp = normalizeTimestamp(input.lastTimestamp || input.last_timestamp || input.timestamp || existing?.lastTimestamp || nowSeconds());
  const chat = {
    id,
    name: String(input.name || input.title || input.contact_name || input.senderName || input.sender_name || existing?.name || id).trim(),
    lastMessage: String(input.lastMessage ?? input.last_message ?? input.body ?? input.text ?? existing?.lastMessage ?? ''),
    lastTimestamp: timestamp,
    unreadCount: Number(input.unreadCount ?? input.unread_count ?? input.unread ?? existing?.unreadCount ?? 0),
    isGroup: Boolean(input.isGroup ?? input.is_group ?? id.endsWith('@g.us') ?? existing?.isGroup ?? false),
    muted: Boolean(input.muted ?? existing?.muted ?? false),
    pinned: Boolean(input.pinned ?? existing?.pinned ?? false),
    archived: Boolean(input.archived ?? existing?.archived ?? false),
    online: Boolean(input.online ?? existing?.online ?? false),
    avatarUrl: input.avatarUrl || input.avatar_url || existing?.avatarUrl || null
  };

  const now = nowSeconds();
  db.prepare(`
    INSERT INTO chats (id, name, last_message, last_timestamp, unread_count, is_group, muted, pinned, archived, online, avatar_url, created_at, updated_at)
    VALUES (@id, @name, @lastMessage, @lastTimestamp, @unreadCount, @isGroup, @muted, @pinned, @archived, @online, @avatarUrl, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      last_message = excluded.last_message,
      last_timestamp = excluded.last_timestamp,
      unread_count = excluded.unread_count,
      is_group = excluded.is_group,
      muted = excluded.muted,
      pinned = excluded.pinned,
      archived = excluded.archived,
      online = excluded.online,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
  `).run({
    id: chat.id,
    name: chat.name || chat.id,
    lastMessage: chat.lastMessage,
    lastTimestamp: chat.lastTimestamp,
    unreadCount: chat.unreadCount,
    isGroup: asBoolInt(chat.isGroup),
    muted: asBoolInt(chat.muted),
    pinned: asBoolInt(chat.pinned),
    archived: asBoolInt(chat.archived),
    online: asBoolInt(chat.online),
    avatarUrl: chat.avatarUrl,
    now
  });

  return getChat(id);
}

function getChat(id) {
  const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(String(id));
  return row ? mapChat(row) : null;
}

function listChats() {
  return db.prepare('SELECT * FROM chats ORDER BY pinned DESC, last_timestamp DESC, updated_at DESC').all().map(mapChat);
}

function mapChat(row) {
  return {
    id: row.id,
    name: row.name,
    lastMessage: row.last_message || '',
    lastTimestamp: row.last_timestamp,
    unreadCount: row.unread_count || 0,
    isGroup: toBool(row.is_group),
    muted: toBool(row.muted),
    pinned: toBool(row.pinned),
    archived: toBool(row.archived),
    online: toBool(row.online),
    avatarUrl: row.avatar_url || null
  };
}

function extractBody(input) {
  const type = String(input.type || input.message_type || 'text').toLowerCase();
  const body = String(input.body ?? input.text ?? input.message ?? input.caption ?? '').trim();
  if (body) return body;
  if (type === 'image') return '[Bild]';
  if (type === 'video') return '[Video]';
  if (type === 'audio' || type === 'ptt') return '[Audio]';
  if (type === 'document') return `[Dokument${input.filename || input.fileName || input.file_name ? ': ' + (input.filename || input.fileName || input.file_name) : ''}]`;
  if (type === 'sticker') return '[Sticker]';
  if (type === 'location') return '[Standort]';
  return `[${type}]`;
}

function insertMessage(input) {
  const timestamp = normalizeTimestamp(input.timestamp || nowSeconds());
  const direction = input.direction === 'out' || input.direction === 'outgoing' || input.fromMe === true ? 'out' : 'in';
  const type = String(input.type || input.message_type || 'text').toLowerCase();
  const id = String(input.id || input.messageId || input.wa_message_id || input.provider_message_id || `${direction}_${timestamp}_${randomUUID()}`);
  const chatId = String(input.chatId || input.chat_id || input.from || input.to || input.contact_wa_id || '').trim();
  if (!chatId) throw new Error('chatId is required');

  const body = extractBody({ ...input, type });
  const senderName = input.senderName || input.sender_name || input.contact_name || input.name || null;
  const senderId = input.senderId || input.sender_id || input.author || input.from || null;
  const senderNumber = input.senderNumber || input.sender_number || (senderId ? String(senderId).split('@')[0] : null);
  const chatName = input.chatName || input.chat_name || null;
  const existing = getChat(chatId);

  upsertChat({
    id: chatId,
    name: chatName || input.chatName || input.chat_name || senderName || existing?.name || chatId,
    lastMessage: body,
    lastTimestamp: timestamp,
    unreadCount: direction === 'in' ? (existing?.unreadCount || 0) + 1 : (existing?.unreadCount || 0),
    isGroup: input.isGroup || input.is_group || chatId.endsWith('@g.us'),
    avatarUrl: input.avatarUrl || input.avatar_url || existing?.avatarUrl || null
  });

  const now = nowSeconds();
  db.prepare(`
    INSERT INTO messages (
      id, chat_id, sender_name, sender_id, sender_number, chat_name, body, direction, type, timestamp, status, provider_message_id,
      media_url, file_name, mime_type, file_size, scan_status, scan_result, original_file_name, original_mime_type, raw_json, created_at, updated_at
    )
    VALUES (
      @id, @chatId, @senderName, @senderId, @senderNumber, @chatName, @body, @direction, @type, @timestamp, @status, @providerMessageId,
      @mediaUrl, @fileName, @mimeType, @fileSize, @scanStatus, @scanResult, @originalFileName, @originalMimeType, @rawJson, @now, @now
    )
    ON CONFLICT(id) DO UPDATE SET
      chat_id = excluded.chat_id,
      sender_name = excluded.sender_name,
      sender_id = excluded.sender_id,
      sender_number = excluded.sender_number,
      chat_name = excluded.chat_name,
      body = excluded.body,
      direction = excluded.direction,
      type = excluded.type,
      timestamp = excluded.timestamp,
      status = excluded.status,
      provider_message_id = excluded.provider_message_id,
      media_url = excluded.media_url,
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      file_size = excluded.file_size,
      scan_status = excluded.scan_status,
      scan_result = excluded.scan_result,
      original_file_name = excluded.original_file_name,
      original_mime_type = excluded.original_mime_type,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).run({
    id,
    chatId,
    senderName,
    senderId,
    senderNumber,
    chatName,
    body,
    direction,
    type,
    timestamp,
    status: input.status || (direction === 'out' ? 'sent' : 'received'),
    providerMessageId: input.providerMessageId || input.provider_message_id || input.waMessageId || null,
    mediaUrl: input.mediaUrl || input.media_url || input.url || null,
    fileName: input.fileName || input.file_name || input.filename || null,
    mimeType: input.mimeType || input.mime_type || input.mimetype || null,
    fileSize: input.fileSize || input.file_size || input.size || null,
    scanStatus: input.scanStatus || input.scan_status || null,
    scanResult: input.scanResult || input.scan_result || null,
    originalFileName: input.originalFileName || input.original_file_name || null,
    originalMimeType: input.originalMimeType || input.original_mime_type || null,
    rawJson: json(input.raw || input.raw_json || input),
    now
  });

  return getMessage(id);
}

function getMessage(id) {
  const row = db.prepare('SELECT * FROM messages WHERE id = ? OR provider_message_id = ?').get(String(id), String(id));
  return row ? mapMessage(row) : null;
}

function updateMessageStatus(id, status) {
  db.prepare('UPDATE messages SET status = ?, updated_at = ? WHERE id = ? OR provider_message_id = ?')
    .run(String(status), nowSeconds(), String(id), String(id));
  return getMessage(id);
}

function listMessages(chatId, limit = 300) {
  return db.prepare(`
    SELECT * FROM messages
    WHERE chat_id = ?
    ORDER BY timestamp DESC, created_at DESC
    LIMIT ?
  `).all(String(chatId), Number(limit)).reverse().map(mapMessage);
}

function listAllMessages(limitPerChat = 300) {
  const chats = listChats();
  const result = {};
  for (const chat of chats) {
    result[chat.id] = listMessages(chat.id, limitPerChat);
  }
  return result;
}

function mapMessage(row) {
  return {
    id: row.id,
    messageId: row.id,
    chatId: row.chat_id,
    senderName: row.sender_name || null,
    senderId: row.sender_id || null,
    senderNumber: row.sender_number || null,
    chatName: row.chat_name || null,
    body: row.body || '',
    direction: row.direction,
    type: row.type || 'text',
    timestamp: row.timestamp,
    status: row.status || null,
    providerMessageId: row.provider_message_id || null,
    mediaUrl: row.media_url || null,
    fileName: row.file_name || null,
    mimeType: row.mime_type || null,
    fileSize: row.file_size || null,
    scanStatus: row.scan_status || null,
    scanResult: row.scan_result || null,
    originalFileName: row.original_file_name || null,
    originalMimeType: row.original_mime_type || null
  };
}

function upsertStatus(input) {
  const id = String(input.id || input.statusId || `status_${randomUUID()}`);
  const now = nowSeconds();
  db.prepare(`
    INSERT INTO statuses (id, name, timestamp, viewed, is_mine, raw_json, created_at, updated_at)
    VALUES (@id, @name, @timestamp, @viewed, @isMine, @rawJson, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      timestamp = excluded.timestamp,
      viewed = excluded.viewed,
      is_mine = excluded.is_mine,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).run({
    id,
    name: input.name || input.contact_name || input.from || 'Status',
    timestamp: normalizeTimestamp(input.timestamp || now),
    viewed: asBoolInt(input.viewed),
    isMine: asBoolInt(input.isMine || input.is_mine),
    rawJson: json(input.raw || input),
    now
  });
  return getStatus(id);
}

function getStatus(id) {
  const row = db.prepare('SELECT * FROM statuses WHERE id = ?').get(String(id));
  return row ? mapStatus(row) : null;
}

function listStatuses(limit = 50) {
  return db.prepare('SELECT * FROM statuses ORDER BY timestamp DESC LIMIT ?').all(Number(limit)).map(mapStatus);
}

function mapStatus(row) {
  return {
    id: row.id,
    name: row.name,
    timestamp: row.timestamp,
    viewed: toBool(row.viewed),
    isMine: toBool(row.is_mine)
  };
}

function insertCall(input) {
  const id = String(input.id || input.callId || `call_${randomUUID()}`);
  const chatId = String(input.chatId || input.peerJid || input.from || input.chat_id || id);
  const outgoing = Boolean(input.outgoing || input.direction === 'out' || input.direction === 'outgoing');
  const now = nowSeconds();

  const missed = input.missed !== undefined ? Boolean(input.missed) : !outgoing;
  const isVideo = Boolean(input.isVideo || input.is_video);
  upsertChat({
    id: chatId,
    name: input.name || input.contact_name || chatId,
    lastMessage: missed
      ? (isVideo ? 'Verpasster Videoanruf' : 'Verpasster Sprachanruf')
      : (isVideo ? 'Videoanruf' : 'Sprachanruf'),
    lastTimestamp: normalizeTimestamp(input.timestamp || now),
    unreadCount: missed && !outgoing ? ((getChat(chatId)?.unreadCount || 0) + 1) : (getChat(chatId)?.unreadCount || 0),
    isGroup: input.isGroup || input.is_group || chatId.endsWith('@g.us')
  });

  db.prepare(`
    INSERT INTO calls (id, chat_id, name, direction, missed, is_video, timestamp, raw_json, created_at, updated_at)
    VALUES (@id, @chatId, @name, @direction, @missed, @isVideo, @timestamp, @rawJson, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      chat_id = excluded.chat_id,
      name = excluded.name,
      direction = excluded.direction,
      missed = excluded.missed,
      is_video = excluded.is_video,
      timestamp = excluded.timestamp,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).run({
    id,
    chatId,
    name: input.name || input.contact_name || chatId,
    direction: outgoing ? 'out' : 'in',
    missed: asBoolInt(missed),
    isVideo: asBoolInt(isVideo),
    timestamp: normalizeTimestamp(input.timestamp || now),
    rawJson: json(input.raw || input),
    now
  });
  return getCall(id);
}

function getCall(id) {
  const row = db.prepare('SELECT * FROM calls WHERE id = ?').get(String(id));
  return row ? mapCall(row) : null;
}

function listCalls(limit = 100) {
  return db.prepare('SELECT * FROM calls ORDER BY timestamp DESC LIMIT ?').all(Number(limit)).map(mapCall);
}

function mapCall(row) {
  return {
    id: row.id,
    chatId: row.chat_id,
    name: row.name,
    direction: row.direction,
    missed: toBool(row.missed),
    isVideo: toBool(row.is_video),
    timestamp: row.timestamp
  };
}

function setChatFlag(chatId, flag, value) {
  const allowed = { muted: 'muted', pinned: 'pinned', archived: 'archived', online: 'online' };
  const column = allowed[flag];
  if (!column) throw new Error(`Unsupported chat flag: ${flag}`);
  const id = String(chatId);
  if (!getChat(id)) {
    upsertChat({ id, name: id, lastMessage: '', lastTimestamp: nowSeconds(), unreadCount: 0 });
  }
  db.prepare(`UPDATE chats SET ${column} = ?, updated_at = ? WHERE id = ?`).run(asBoolInt(value), nowSeconds(), id);
  return getChat(id);
}

function setChatUnread(chatId, count) {
  const id = String(chatId);
  if (!getChat(id)) {
    upsertChat({ id, name: id, lastMessage: '', lastTimestamp: nowSeconds(), unreadCount: 0 });
  }
  db.prepare('UPDATE chats SET unread_count = ?, updated_at = ? WHERE id = ?').run(Number(count || 0), nowSeconds(), id);
  return getChat(id);
}

function getBootstrap() {
  return {
    chats: listChats(),
    messagesByChat: listAllMessages(300),
    statuses: listStatuses(50),
    calls: listCalls(100)
  };
}

function resetDatabase() {
  db.exec(`
    DELETE FROM messages;
    DELETE FROM calls;
    DELETE FROM statuses;
    DELETE FROM chats;
    DELETE FROM settings;
  `);
}

function seedDemoData() {
  const now = nowSeconds();
  upsertChat({ id: '491701234567', name: 'Max Test', lastMessage: 'Hallo vom Server', lastTimestamp: now - 30, unreadCount: 1 });
  insertMessage({ id: 'demo_in_1', chatId: '491701234567', senderName: 'Max Test', body: 'Hallo vom Server 👋', direction: 'in', timestamp: now - 30, status: 'received' });
  insertMessage({ id: 'demo_out_1', chatId: '491701234567', senderName: 'Ich', body: 'Hi, die App ist verbunden.', direction: 'out', timestamp: now - 20, status: 'sent' });
  insertCall({ id: 'call_demo_1', chatId: '491701234567', name: 'Max Test', isVideo: false, missed: true, timestamp: now - 300 });
}

module.exports = {
  db,
  dbFile,
  migrate,
  nowSeconds,
  normalizeTimestamp,
  upsertChat,
  getChat,
  listChats,
  insertMessage,
  getMessage,
  updateMessageStatus,
  listMessages,
  listAllMessages,
  upsertStatus,
  listStatuses,
  insertCall,
  listCalls,
  getBootstrap,
  resetDatabase,
  seedDemoData,
  setChatFlag,
  setChatUnread
};
