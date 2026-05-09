const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { Client, LocalAuth, MessageMedia } = require('../wwebjs-demo');

class WWebJSDemoProvider extends EventEmitter {
  constructor() {
    super();
    this.name = 'wwebjs-demo';
    this.client = new Client({ authStrategy: new LocalAuth({ clientId: 'own-messenger-demo' }) });
    this.ready = false;
    this.attachEvents();
  }

  attachEvents() {
    this.client.on('authenticated', (data) => this.emit('authenticated', data));
    this.client.on('ready', () => {
      this.ready = true;
      this.emit('ready', { provider: this.name, ready: true, qrLogin: false, state: 'CONNECTED' });
    });
    this.client.on('message', (message) => this.emit('message', normalizeMessage(message)));
    this.client.on('message_create', (message) => this.emit('message_create', normalizeMessage(message)));
    this.client.on('message_ack', (message, ack) => {
      this.emit('message_ack', { id: message.id._serialized, messageId: message.id._serialized, status: ackToStatus(ack), ack });
    });
    this.client.on('incoming_call', (call) => {
      this.emit('incoming_call', {
        id: String(call.id),
        chatId: call.peerJid,
        peerJid: call.peerJid,
        name: call.name || call.peerJid,
        isVideo: Boolean(call.isVideo),
        isGroup: Boolean(call.isGroup),
        outgoing: Boolean(call.outgoing),
        missed: !call.outgoing,
        timestamp: call.timestamp || Math.floor(Date.now() / 1000),
        raw: call
      });
    });
    this.client.on('chat_update', (chat) => this.emit('chat_update', chat));
    this.client.on('chat_archived', (chatId, archived) => this.emit('chat_archived', { chatId, archived }));
    this.client.on('disconnected', (reason) => {
      this.ready = false;
      this.emit('disconnected', { reason });
    });
  }

  async start() {
    await this.client.initialize();
  }

  async stop() {
    await this.client.destroy();
  }

  async sendMessage({ to, chatId, text, raw }) {
    let content = text;
    const mediaPath = raw?.mediaPath || raw?.filePath;
    if (mediaPath && fs.existsSync(mediaPath)) {
      content = MessageMedia.fromFilePath(path.resolve(mediaPath));
    }
    const message = await this.client.sendMessage(chatId || to, content, raw?.options || {});
    return {
      id: message.id._serialized,
      providerMessageId: message.id._serialized,
      chatId: message.to,
      to,
      text,
      status: 'sent',
      timestamp: message.timestamp,
      provider: this.name
    };
  }
}

function ackToStatus(ack) {
  if (ack >= 3) return 'read';
  if (ack >= 2) return 'delivered';
  if (ack >= 1) return 'sent';
  return 'pending';
}

function normalizeMessage(message) {
  return {
    id: message.id._serialized,
    providerMessageId: message.id._serialized,
    chatId: message.fromMe ? message.to : message.from,
    senderName: message.author || (message.fromMe ? 'Ich' : message.from),
    body: message.body,
    direction: message.fromMe ? 'out' : 'in',
    type: message.type,
    timestamp: message.timestamp,
    status: message.fromMe ? 'sent' : 'received',
    raw: message.rawData || message
  };
}

module.exports = { WWebJSDemoProvider };
