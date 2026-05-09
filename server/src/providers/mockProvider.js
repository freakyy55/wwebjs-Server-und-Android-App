const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

class MockProvider extends EventEmitter {
  constructor() {
    super();
    this.name = 'mock';
    this.ready = false;
  }

  async start() {
    this.ready = true;
    setTimeout(() => this.emit('ready', { provider: this.name, ready: true }), 100);
  }

  async stop() {
    this.ready = false;
  }

  async sendMessage({ to, chatId, text }) {
    const id = `mock_${randomUUID()}`;
    return {
      id,
      providerMessageId: id,
      chatId: chatId || to,
      to,
      text,
      status: 'sent',
      timestamp: Math.floor(Date.now() / 1000)
    };
  }
}

module.exports = { MockProvider };
