const db = require('../src/db');
const { Client, LocalAuth } = require('../src/wwebjs-demo');

const remoteId = '491701234567@c.us';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClient({ options = {}, authenticated = false } = {}) {
  if (authenticated) {
    return new Client({ ...options, authenticated: true, authStrategy: options.authStrategy || new LocalAuth({ clientId: 'test' }) });
  }
  return new Client(options);
}

function resetAndSeed() {
  db.resetDatabase();
  db.upsertChat({ id: remoteId, name: 'Max Test', lastMessage: 'Seed', lastTimestamp: db.nowSeconds(), unreadCount: 0 });
  db.upsertChat({ id: '5511942167462@c.us', name: 'iFood', lastMessage: 'Kontakt', lastTimestamp: db.nowSeconds(), unreadCount: 0 });
}

module.exports = { remoteId, sleep, createClient, resetAndSeed };
