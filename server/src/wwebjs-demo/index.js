const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const { MessageTypes, DefaultOptions } = require('../util/Constants');

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function jid(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  return `${raw}@c.us`;
}

function plainNumberFromJid(value) {
  return String(value || '').replace(/@c\.us$|@g\.us$/i, '');
}

function idObject(value) {
  const serialized = jid(value);
  const server = serialized.endsWith('@g.us') ? 'g.us' : 'c.us';
  return { server, user: plainNumberFromJid(serialized), _serialized: serialized };
}

function isVCardText(value) {
  return typeof value === 'string' && /^BEGIN:VCARD[\s\S]*END:VCARD\s*$/i.test(value.trim());
}

function messageTypeFromContent(content, options = {}) {
  if (content instanceof MessageMedia) {
    if (options.sendMediaAsSticker) return MessageTypes.STICKER;
    if (options.sendMediaAsDocument) return MessageTypes.DOCUMENT;
    const mime = String(content.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return MessageTypes.IMAGE;
    if (mime.startsWith('video/')) return MessageTypes.VIDEO;
    if (mime.startsWith('audio/')) return MessageTypes.AUDIO;
    return MessageTypes.DOCUMENT;
  }
  if (content instanceof Location) return MessageTypes.LOCATION;
  if (content instanceof Contact) return MessageTypes.CONTACT_CARD;
  if (Array.isArray(content) && content.every((item) => item instanceof Contact)) return MessageTypes.CONTACT_CARD_MULTI;
  if (isVCardText(content) && options.parseVCards !== false) return MessageTypes.CONTACT_CARD;
  if (typeof content === 'object' && content && content.type) return String(content.type);
  return MessageTypes.TEXT;
}

function bodyFromContent(content, options = {}) {
  if (content instanceof MessageMedia) {
    if (options.sendMediaAsDocument) return content.filename || options.caption || '[Dokument]';
    return options.caption || `[${messageTypeFromContent(content, options)}: ${content.filename || 'media'}]`;
  }
  if (content instanceof Location) return content.description || `${content.latitude},${content.longitude}`;
  if (content instanceof Contact) return content.toVCard();
  if (Array.isArray(content) && content.every((item) => item instanceof Contact)) return content.map((contact) => contact.toVCard()).join('\n');
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object') {
    return content.body || content.text || content.caption || JSON.stringify(content);
  }
  return String(content ?? '');
}

function parseUserAgentArg(args = []) {
  const arg = args.find((value) => String(value).startsWith('--user-agent='));
  return arg ? String(arg).replace('--user-agent=', '') : null;
}

class LocalAuth {
  constructor(options = {}) {
    this.clientId = options.clientId || 'default';
    this.dataPath = options.dataPath || './.wwebjs_auth_demo';
  }
}

class NoAuth {}
class RemoteAuth {
  constructor(options = {}) {
    Object.assign(this, options);
  }
}

class ClientInfo {
  constructor() {
    this.wid = { _serialized: 'demo-user@c.us', user: 'demo-user', server: 'c.us' };
    this.pushname = 'Demo User';
    this.platform = 'demo';
  }
}

class MessageMedia {
  constructor(mimetype, data, filename = null, filesize = null) {
    this.mimetype = mimetype;
    this.data = data;
    this.filename = filename;
    this.filesize = filesize;
  }

  static fromFilePath(filePath) {
    const absolute = path.resolve(filePath);
    const data = fs.readFileSync(absolute).toString('base64');
    const filename = path.basename(absolute);
    const ext = path.extname(filename).toLowerCase();
    const mimetype = ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif'
      : ext === '.mp4' ? 'video/mp4'
      : ext === '.mp3' ? 'audio/mpeg'
      : 'application/octet-stream';
    return new MessageMedia(mimetype, data, filename, fs.statSync(absolute).size);
  }

  static async fromUrl(url, options = {}) {
    // Demo only: store the URL as metadata. No external download is required for the connection test.
    const filename = options.filename || path.basename(new URL(url).pathname) || 'remote-media.bin';
    const mimetype = filename.endsWith('.png') ? 'image/png'
      : filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg'
      : 'application/octet-stream';
    return new MessageMedia(mimetype, `url:${url}`, filename, null);
  }
}

class Location {
  constructor(latitude, longitude, description = '') {
    this.latitude = latitude;
    this.longitude = longitude;
    this.description = description;
  }
}

class Contact {
  constructor(rowOrId) {
    const id = typeof rowOrId === 'string' ? rowOrId : (rowOrId.id || rowOrId.chatId || rowOrId.wa_id);
    this.id = idObject(id);
    this.number = plainNumberFromJid(id);
    this.name = typeof rowOrId === 'object' ? (rowOrId.name || rowOrId.pushname || this.number) : this.number;
    this.pushname = this.name;
    this.shortName = this.name;
    this.isGroup = this.id._serialized.endsWith('@g.us');
    this.isMe = this.id._serialized === 'demo-user@c.us';
    this.isMyContact = true;
    this.isBlocked = Boolean(Contact.blockedIds.has(this.id._serialized));
  }

  async getProfilePicUrl() {
    const chat = db.getChat(this.id._serialized) || db.getChat(this.number);
    return chat?.avatarUrl || null;
  }

  async getCommonGroups() { return []; }
  async getAbout() { return Contact.aboutById.get(this.id._serialized) || 'Hey there! I am using OwnMessenger demo.'; }
  async block() { Contact.blockedIds.add(this.id._serialized); this.isBlocked = true; return true; }
  async unblock() { Contact.blockedIds.delete(this.id._serialized); this.isBlocked = false; return true; }

  toVCard() {
    return `BEGIN:VCARD\nVERSION:3.0\nFN;CHARSET=UTF-8:${this.name}\nTEL;TYPE=CELL:${this.number}\nEND:VCARD`;
  }
}
Contact.blockedIds = new Set();
Contact.aboutById = new Map([['demo-user@c.us', 'Available']]);

class Message {
  constructor(row, client) {
    this._client = client;
    this.id = { _serialized: row.id || row.messageId || `demo_msg_${randomUUID()}` };
    this.ack = row.status || null;
    this.hasMedia = Boolean(row.mediaUrl || row.hasMedia || row.mimeType || row.mimetype);
    this.body = row.body || '';
    this.type = row.type || MessageTypes.TEXT;
    this.timestamp = row.timestamp || nowSeconds();
    this.from = row.direction === 'out' ? 'demo-user@c.us' : row.chatId;
    this.to = row.direction === 'out' ? row.chatId : 'demo-user@c.us';
    this.author = row.senderName || null;
    this.fromMe = row.direction === 'out';
    this.hasQuotedMsg = false;
    this.location = row.location || null;
    this.vCards = row.vCards || [];
    this.rawData = row;
  }

  async getChat() { return this._client.getChatById(this.fromMe ? this.to : this.from); }
  async getContact() { return new Contact(this.fromMe ? this.to : this.from); }

  async reply(content, chatId = null, options = {}) {
    return this._client.sendMessage(chatId || (this.fromMe ? this.to : this.from), content, {
      ...options,
      quotedMessageId: this.id._serialized
    });
  }

  async react(reaction) {
    this._client.emit('message_reaction', {
      id: `reaction_${randomUUID()}`,
      msgId: this.id,
      reaction,
      senderId: 'demo-user@c.us',
      timestamp: nowSeconds()
    });
    return true;
  }

  async downloadMedia() {
    const row = this.rawData;
    if (!this.hasMedia) return null;
    return new MessageMedia(row.mimeType || row.mimetype || 'application/octet-stream', row.data || '', row.fileName || row.filename || null, row.fileSize || null);
  }

  async delete() { return true; }
  async forward(chat) { return this._client.sendMessage(chat?.id?._serialized || chat, this.body); }
  async star() { return true; }
  async unstar() { return true; }
}

class Chat {
  constructor(row, client) {
    this._client = client;
    this.id = { _serialized: jid(row.id) };
    this.name = row.name || row.id;
    this.isGroup = Boolean(row.isGroup);
    this.isReadOnly = false;
    this.unreadCount = row.unreadCount || 0;
    this.timestamp = row.lastTimestamp || nowSeconds();
    this.archived = Boolean(row.archived);
    this.pinned = Boolean(row.pinned);
    this.isMuted = Boolean(row.muted);
    this.muteExpiration = this.isMuted ? -1 : 0;
    this.lastMessage = row.lastMessage || '';
  }

  async fetchMessages(options = {}) {
    const limit = options.limit || 50;
    return db.listMessages(this.id._serialized, limit).map((row) => new Message(row, this._client));
  }

  async sendMessage(content, options = {}) { return this._client.sendMessage(this.id._serialized, content, options); }
  async sendSeen() { db.setChatUnread(this.id._serialized, 0); this.unreadCount = 0; this._client.emit('chat_update', db.getChat(this.id._serialized)); return true; }
  async markUnread() { db.setChatUnread(this.id._serialized, Math.max(1, this.unreadCount || 1)); this.unreadCount = Math.max(1, this.unreadCount || 1); this._client.emit('chat_update', db.getChat(this.id._serialized)); return true; }
  async archive() { db.setChatFlag(this.id._serialized, 'archived', true); this.archived = true; this._client.emit('chat_archived', this.id._serialized, true); return true; }
  async unarchive() { db.setChatFlag(this.id._serialized, 'archived', false); this.archived = false; this._client.emit('chat_archived', this.id._serialized, false); return true; }
  async pin() { db.setChatFlag(this.id._serialized, 'pinned', true); this.pinned = true; this._client.emit('chat_update', db.getChat(this.id._serialized)); return true; }
  async unpin() { db.setChatFlag(this.id._serialized, 'pinned', false); this.pinned = false; this._client.emit('chat_update', db.getChat(this.id._serialized)); return true; }
  async mute(unmuteDate = null) { db.setChatFlag(this.id._serialized, 'muted', true); this.isMuted = true; this.muteExpiration = unmuteDate instanceof Date ? Math.floor(unmuteDate.getTime() / 1000) : -1; this._client.emit('chat_update', db.getChat(this.id._serialized)); return { isMuted: true, muteExpiration: this.muteExpiration }; }
  async unmute() { db.setChatFlag(this.id._serialized, 'muted', false); this.isMuted = false; this.muteExpiration = 0; this._client.emit('chat_update', db.getChat(this.id._serialized)); return { isMuted: false, muteExpiration: 0 }; }
  async clearMessages() { return true; }
  async delete() { return true; }
  async getContact() { return new Contact(this.id._serialized); }
  async getLabels() { return []; }
  async changeLabels() { return true; }
}

class GroupChat extends Chat {
  constructor(row, client) {
    super({ ...row, isGroup: true }, client);
    this.participants = [];
    this.groupMetadata = { id: this.id, subject: this.name, participants: [] };
  }
  async addParticipants() { return {}; }
  async removeParticipants() { return {}; }
  async promoteParticipants() { return {}; }
  async demoteParticipants() { return {}; }
  async setSubject(subject) { db.upsertChat({ ...(db.getChat(this.id._serialized) || { id: this.id._serialized }), name: subject }); this.name = subject; return true; }
}

class Client extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.authenticated = Boolean(options.authenticated || options.authStrategy instanceof LocalAuth || options.authStrategy instanceof RemoteAuth);
    this.info = new ClientInfo();
    this.ready = false;
    this.name = 'wwebjs-demo';
    this._qrTimer = null;
    this._qrCount = 0;

    const argUA = parseUserAgentArg(options.puppeteer?.args || []);
    this._browserUA = argUA || options.userAgent || DefaultOptions.userAgent;
    this._pageUA = options.userAgent || DefaultOptions.userAgent;
    this.pupBrowser = { userAgent: async () => this._browserUA };
    this.pupPage = { evaluate: async (fn) => this._pageUA };
  }

  async initialize() {
    if (!this.authenticated) {
      const maxRetries = Number(this.options.qrMaxRetries ?? 0);
      const emitQr = () => {
        this._qrCount += 1;
        this.emit('qr', `DEMO_QR_${'x'.repeat(160)}_${this._qrCount}`);
        if (maxRetries && this._qrCount > maxRetries) {
          clearInterval(this._qrTimer);
          this.emit('disconnected', 'Max qrcode retries reached');
        }
      };
      emitQr();
      if (maxRetries) this._qrTimer = setInterval(emitQr, 10);
      return this;
    }

    this.emit('authenticated', { strategy: 'DemoAuth', note: 'QR login is disabled in this demo provider.' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.ready = true;
    this.emit('ready');
    return this;
  }

  async destroy() { if (this._qrTimer) clearInterval(this._qrTimer); this.ready = false; this.emit('disconnected', 'destroyed'); }
  async logout() { if (this._qrTimer) clearInterval(this._qrTimer); this.ready = false; this.authenticated = false; this.emit('disconnected', 'logout'); return true; }
  async getState() { return this.ready ? 'CONNECTED' : 'OPENING'; }
  async getWWebVersion() { return 'demo-1.34.7-compatible'; }
  async sendPresenceAvailable() { return true; }
  async sendPresenceUnavailable() { return true; }

  async getChats() { return db.listChats().map((row) => row.isGroup ? new GroupChat(row, this) : new Chat(row, this)); }

  async getChatById(chatId) {
    const id = jid(chatId);
    const row = db.getChat(id) || db.getChat(String(chatId));
    if (!row) db.upsertChat({ id, name: plainNumberFromJid(id), lastMessage: '', lastTimestamp: nowSeconds(), unreadCount: 0 });
    const fresh = db.getChat(id) || db.getChat(String(chatId));
    return fresh.isGroup ? new GroupChat(fresh, this) : new Chat(fresh, this);
  }

  async getContacts() { return db.listChats().map((row) => new Contact(row)); }
  async getContactById(contactId) { return new Contact(contactId); }
  async getBlockedContacts() { return Array.from(Contact.blockedIds).map((id) => new Contact(id)); }
  async getProfilePicUrl(contactId) { return (db.getChat(jid(contactId)) || db.getChat(contactId))?.avatarUrl || null; }
  async isRegisteredUser(id) { return !String(id || '').includes('9999999999'); }
  async getNumberId(number) { if (String(number).includes('9999999999')) return null; return idObject(number); }
  async getFormattedNumber(number) {
    const plain = plainNumberFromJid(number);
    if (plain === '18092201111') return '+1 (809) 220-1111';
    return `+${plain}`;
  }
  async getCountryCode(number) { const plain = plainNumberFromJid(number); return plain.startsWith('1') ? '1' : plain.slice(0, 2); }
  async setStatus(status) { Contact.aboutById.set(this.info.wid._serialized, String(status)); return true; }

  async sendMessage(chatId, content, options = {}) {
    const id = jid(chatId);
    const type = messageTypeFromContent(content, options);
    const body = bodyFromContent(content, options);
    const msgId = `demo_${randomUUID()}`;
    const media = content instanceof MessageMedia ? content : null;
    const location = content instanceof Location ? content : null;
    const vCards = content instanceof Contact ? [content.toVCard()]
      : Array.isArray(content) && content.every((item) => item instanceof Contact) ? content.map((contact) => contact.toVCard())
      : isVCardText(content) && options.parseVCards !== false ? [content]
      : [];

    const row = db.insertMessage({
      id: msgId,
      providerMessageId: msgId,
      chatId: id,
      senderName: 'Ich',
      body,
      direction: 'out',
      type,
      timestamp: nowSeconds(),
      status: 'sent',
      mediaUrl: options.mediaUrl || null,
      fileName: media?.filename || options.fileName || null,
      mimeType: media?.mimetype || options.mimeType || null,
      fileSize: media?.filesize || options.fileSize || null,
      raw: { content: media ? { mimetype: media.mimetype, filename: media.filename, filesize: media.filesize } : content, options, vCards, location }
    });

    const message = new Message({ ...row, hasMedia: Boolean(media), mimeType: media?.mimetype, fileName: media?.filename, fileSize: media?.filesize, vCards, location }, this);
    this.emit('message_create', message);
    setTimeout(() => this.emit('message_ack', message, 1), 5);
    setTimeout(() => this.emit('message_ack', message, 2), 20);
    return message;
  }

  async getMessageById(messageId) { const row = db.getMessage(messageId?._serialized || messageId); return row ? new Message(row, this) : null; }

  async createGroup(title, participants = []) { const id = `demo_group_${randomUUID()}@g.us`; db.upsertChat({ id, name: title, isGroup: true, lastMessage: 'Gruppe erstellt', lastTimestamp: nowSeconds(), unreadCount: 0 }); this.emit('group_join', { chatId: id, author: 'demo-user@c.us', timestamp: nowSeconds(), participants }); return { gid: { _serialized: id }, participants }; }
  async acceptInvite(inviteCode) { return `accepted_${inviteCode}@g.us`; }
  async getInviteInfo(inviteCode) { return { code: inviteCode, title: 'Demo Invite', participants: [] }; }
  async searchMessages(query, options = {}) { const limit = options.limit || 50; const hits = []; const chatIds = options.chatId ? [jid(options.chatId)] : db.listChats().map((c) => c.id); for (const chatId of chatIds) { for (const message of db.listMessages(chatId, 300)) { if (String(message.body || '').toLowerCase().includes(String(query || '').toLowerCase())) hits.push(new Message(message, this)); if (hits.length >= limit) return hits; } } return hits; }

  async sendSeen(chatId) { return (await this.getChatById(chatId)).sendSeen(); }
  async archiveChat(chatId) { return (await this.getChatById(chatId)).archive(); }
  async unarchiveChat(chatId) { return (await this.getChatById(chatId)).unarchive(); }
  async pinChat(chatId) { return (await this.getChatById(chatId)).pin(); }
  async unpinChat(chatId) { return (await this.getChatById(chatId)).unpin(); }
  async muteChat(chatId, unmuteDate = null) { return (await this.getChatById(chatId)).mute(unmuteDate); }
  async unmuteChat(chatId) { return (await this.getChatById(chatId)).unmute(); }

  async createCallLink(startTime, callType) { const type = callType === 'video' ? 'video' : 'voice'; const suffix = Buffer.from(`${type}:${startTime instanceof Date ? startTime.toISOString() : startTime}:${randomUUID()}`).toString('base64url').slice(0, 20); return `https://call.whatsapp.com/${type}/${suffix}`; }

  async __demoIncomingMessage({ from, chatId, name, body, text, type = 'text', mediaUrl = null, fileName = null, mimeType = null, fileSize = null }) {
    const id = `demo_in_${randomUUID()}`;
    const row = db.insertMessage({ id, providerMessageId: id, chatId: jid(chatId || from), senderName: name || plainNumberFromJid(from || chatId), body: body || text || '', direction: 'in', type, timestamp: nowSeconds(), status: 'received', mediaUrl, fileName, mimeType, fileSize, raw: { from, chatId, name, body, text, type, mediaUrl, fileName, mimeType, fileSize } });
    const message = new Message(row, this);
    this.emit('message', message);
    return message;
  }

  async __demoIncomingCall({ from, chatId, name, isVideo = false, isGroup = false }) {
    const call = { id: `demo_call_${randomUUID()}`, peerJid: jid(chatId || from), isVideo: Boolean(isVideo), isGroup: Boolean(isGroup), canHandleLocally: false, outgoing: false, webClientShouldHandle: false, participants: {}, timestamp: nowSeconds(), name: name || plainNumberFromJid(from || chatId) };
    this.emit('incoming_call', call);
    return call;
  }
}

module.exports = { Client, LocalAuth, NoAuth, RemoteAuth, ClientInfo, Chat, GroupChat, Message, MessageMedia, Contact, Location, MessageTypes, DefaultOptions };
