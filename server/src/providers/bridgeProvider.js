const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

class BridgeProvider extends EventEmitter {
  constructor() {
    super();
    this.name = 'bridge';
    this.ready = false;
    this.sendUrl = process.env.BRIDGE_SEND_URL || '';
    this.token = process.env.BRIDGE_TOKEN || '';
  }

  async start() {
    this.ready = true;
    setTimeout(() => {
      this.emit('ready', {
        provider: this.name,
        ready: true,
        mode: this.sendUrl ? 'outgoing-http' : 'inbound-only',
        sendUrlConfigured: Boolean(this.sendUrl)
      });
    }, 100);
  }

  async stop() {
    this.ready = false;
  }

  async sendMessage({ to, chatId, text, raw }) {
    if (!this.sendUrl) {
      throw new Error('PROVIDER=bridge ist aktiv, aber BRIDGE_SEND_URL fehlt. Trage die URL deines externen Provider-Prozesses in .env ein.');
    }

    const payload = {
      id: `bridge_req_${randomUUID()}`,
      to,
      chatId: chatId || to,
      text,
      type: raw?.type || 'text',
      raw: raw || null,
      timestamp: Math.floor(Date.now() / 1000)
    };

    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
      headers['X-Bridge-Token'] = this.token;
    }

    const response = await fetch(this.sendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const textResponse = await response.text();
    let data = {};
    try {
      data = textResponse ? JSON.parse(textResponse) : {};
    } catch (_) {
      data = { raw: textResponse };
    }

    if (!response.ok) {
      throw new Error(`Bridge send failed: HTTP ${response.status} ${JSON.stringify(data)}`);
    }

    return {
      id: data.id || data.messageId || data.providerMessageId || `bridge_${randomUUID()}`,
      providerMessageId: data.providerMessageId || data.waMessageId || data.messageId || data.id || null,
      chatId: data.chatId || chatId || to,
      to,
      text,
      status: data.status || 'sent',
      timestamp: data.timestamp || Math.floor(Date.now() / 1000),
      bridgeResponse: data
    };
  }
}

module.exports = { BridgeProvider };
