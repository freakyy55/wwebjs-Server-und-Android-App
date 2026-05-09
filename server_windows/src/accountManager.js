const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ACCOUNTS_DIR = path.join(PROJECT_ROOT, 'data', 'accounts');
const ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'accounts.json');
const LEGACY_KEY_FILE = path.join(PROJECT_ROOT, 'APP_KEY.txt');
const MAX_WA_ACCOUNTS = Math.max(1, Math.min(5, Number(process.env.MAX_WA_ACCOUNTS || 5)));


function randomKey() {
  return crypto.randomBytes(32).toString('hex');
}

function cleanId(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
  return raw || `account_${Date.now()}`;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function safeWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function isBadKey(value) {
  const v = String(value || '').trim();
  return !v || v.length < 32 || /ECHO ist ausgeschaltet|ECHO is off|ECHO is on/i.test(v);
}

function writeLegacyKeyFile(key) {
  if (isBadKey(key)) return;
  const text = [
    'Own Messenger App-Key',
    '======================',
    '',
    key,
    '',
    'Diesen Key in der Android-App eintragen.',
    'Bei Multi-Account gibt es weitere Keys in data/accounts/accounts.json.',
    'Behandle diese Datei wie ein Passwort.',
    `Erstellt/aktualisiert: ${new Date().toISOString()}`,
    ''
  ].join('\n');
  try { fs.writeFileSync(LEGACY_KEY_FILE, text, 'utf8'); } catch (_) {}
}


function makeSlotConfig(slot, existing = {}) {
  const id = slot === 1 ? 'main' : `wa${slot}`;
  const fallbackName = slot === 1 ? 'Hauptnummer' : `WhatsApp Nummer ${slot}`;
  const legacyAppToken = slot === 1 ? String(process.env.APP_TOKEN || process.env.APP_KEY || '').trim() : '';
  let appKey = String(existing.appKey || existing.app_key || existing.token || legacyAppToken || '').trim();
  if (isBadKey(appKey)) appKey = '';
  return {
    id,
    name: String(existing.name || fallbackName).trim(),
    appKey,
    admin: slot === 1 ? true : Boolean(existing.admin),
    enabled: existing.enabled !== false,
    provider: existing.provider || process.env.PROVIDER || 'wwebjs',
    clientId: existing.clientId || existing.client_id || `own-messenger-${id}`,
    dbPath: existing.dbPath || existing.db_path || (slot === 1 ? (process.env.DB_PATH || './data/own_messenger.sqlite') : `./data/accounts/${id}/own_messenger.sqlite`),
    uploadDir: existing.uploadDir || existing.upload_dir || (slot === 1 ? (process.env.UPLOAD_DIR || './uploads') : `./uploads/${id}`),
    createdAt: existing.createdAt || new Date().toISOString(),
    appKeyAcknowledged: Boolean(existing.appKeyAcknowledged || existing.app_key_acknowledged)
  };
}

function ensureFixedWaSlots(list) {
  const byId = new Map();
  for (const item of list || []) {
    const id = cleanId(item.id || item.name || '');
    if (!id) continue;
    byId.set(id, { ...item, id });
  }

  const result = [];
  for (let slot = 1; slot <= MAX_WA_ACCOUNTS; slot += 1) {
    const id = slot === 1 ? 'main' : `wa${slot}`;
    result.push(makeSlotConfig(slot, byId.get(id) || {}));
    byId.delete(id);
  }

  // Bestehende zusaetzliche Accounts nicht verlieren, aber standardmaessig bei 5 Slots bleiben.
  for (const item of byId.values()) {
    const normalized = makeSlotConfig(result.length + 1, item);
    normalized.id = cleanId(item.id || normalized.id);
    normalized.name = String(item.name || normalized.id).trim();
    result.push(normalized);
  }

  process.env.APP_TOKEN = result[0]?.appKey || '';
  return result;
}

function createDefaultAccounts() {
  const slots = ensureFixedWaSlots([]);
  if (!isBadKey(slots[0]?.appKey)) writeLegacyKeyFile(slots[0].appKey);
  return slots;
}

function normalizeAccounts(raw) {
  const list = Array.isArray(raw?.accounts) ? raw.accounts : (Array.isArray(raw) ? raw : []);
  if (!list.length) return createDefaultAccounts();
  return ensureFixedWaSlots(list);
}

function createAccountManager({ createProvider, createDb }) {
  fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  let accountsConfig = normalizeAccounts(safeReadJson(ACCOUNTS_FILE, null));
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    safeWriteJson(ACCOUNTS_FILE, { version: 1, accounts: accountsConfig });
  } else {
    safeWriteJson(ACCOUNTS_FILE, { version: 1, accounts: accountsConfig });
  }
  if (!isBadKey(accountsConfig[0]?.appKey)) writeLegacyKeyFile(accountsConfig[0].appKey);

  const accounts = accountsConfig.filter(a => a.enabled !== false).map((cfg) => {
    const accountRoot = path.join(ACCOUNTS_DIR, cfg.id);
    fs.mkdirSync(accountRoot, { recursive: true });
    const db = createDb(cfg.dbPath);
    db.migrate();
    const provider = createProvider({
      accountId: cfg.id,
      accountName: cfg.name,
      providerName: cfg.provider,
      clientId: cfg.clientId,
      authDataPath: path.join(accountRoot, '.wwebjs_auth'),
      uploadDir: path.resolve(PROJECT_ROOT, cfg.uploadDir || `./uploads/${cfg.id}`)
    });
    provider.accountId = cfg.id;
    provider.accountName = cfg.name;
    return { ...cfg, db, provider, keyHash: isBadKey(cfg.appKey) ? '' : hashKey(cfg.appKey), accountRoot };
  });

  const byId = new Map(accounts.map(a => [a.id, a]));
  const byKeyHash = new Map();
  const defaultAccount = accounts[0];
  const duplicateKeyRepairs = [];

  function rebuildKeyIndex() {
    byKeyHash.clear();
    for (const account of accounts) {
      account.keyHash = isBadKey(account.appKey) ? '' : hashKey(account.appKey);
      if (account.keyHash && !byKeyHash.has(account.keyHash)) {
        byKeyHash.set(account.keyHash, account);
      }
    }
  }

  function repairDuplicateAppKeys() {
    const seen = new Map();
    let changed = false;
    for (const account of accounts) {
      if (isBadKey(account.appKey)) continue;
      const keyHash = hashKey(account.appKey);
      const first = seen.get(keyHash);
      if (!first) {
        seen.set(keyHash, account);
        continue;
      }
      // Jeder WhatsApp-Slot MUSS einen eigenen App-Key haben.
      // Alte Testversionen konnten denselben Key in mehrere Slots schreiben; dann
      // wird je nach Client/Cache scheinbar immer derselbe WhatsApp-Account benutzt.
      const oldPreview = `${String(account.appKey).slice(0, 6)}...${String(account.appKey).slice(-6)}`;
      account.appKey = randomKey();
      account.keyHash = hashKey(account.appKey);
      account.appKeyAcknowledged = false;
      duplicateKeyRepairs.push({ accountId: account.id, duplicatedWith: first.id, oldPreview });
      changed = true;
    }
    rebuildKeyIndex();
    if (changed) saveAccounts();
    return duplicateKeyRepairs;
  }

  function saveAccounts() {
    safeWriteJson(ACCOUNTS_FILE, {
      version: 1,
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name,
        appKey: a.appKey,
        admin: a.admin,
        enabled: a.enabled,
        provider: a.providerName || a.provider?.name || a.provider,
        clientId: a.clientId,
        dbPath: a.dbPath,
        uploadDir: a.uploadDir,
        createdAt: a.createdAt,
        appKeyAcknowledged: Boolean(a.appKeyAcknowledged)
      }))
    });
    if (!isBadKey(accounts[0]?.appKey)) writeLegacyKeyFile(accounts[0].appKey);
  }

  function getByToken(token) {
    const clean = String(token || '').trim();
    if (isBadKey(clean)) return null;
    const keyHash = hashKey(clean);
    return byKeyHash.get(keyHash) || null;
  }

  function listSafe(showSecrets = false) {
    return accounts.map(a => ({
      id: a.id,
      name: a.name,
      admin: Boolean(a.admin),
      enabled: a.enabled !== false,
      provider: a.provider?.name || a.provider,
      providerName: a.provider?.name || a.provider,
      clientId: a.clientId,
      ready: Boolean(a.provider?.ready),
      state: a.provider?.state || null,
      hasQr: Boolean(a.provider?.lastQrRaw || a.provider?.lastQr),
      hasSession: typeof a.provider?.hasSession === 'function' ? a.provider.hasSession() : undefined,
      started: Boolean(a.provider?.initializing || a.provider?.ready || !['NOT_STARTED','STOPPED'].includes(String(a.provider?.state || '').toUpperCase())),
      lastPairingCode: showSecrets ? (a.provider?.lastPairingCode || '') : undefined,
      lastPairingCodeAt: a.provider?.lastPairingCodeAt || 0,
      pairingPhone: showSecrets ? (a.provider?.lastPairingPhone || '') : undefined,
      lastError: a.provider?.lastError || a.provider?.lastSyncError || a.provider?.lastPairingError || null,
      dbPath: a.dbPath,
      appKey: showSecrets ? (a.appKey || '') : undefined,
      appKeyReady: !isBadKey(a.appKey),
      appKeyAcknowledged: Boolean(a.appKeyAcknowledged),
      appKeyPreview: isBadKey(a.appKey) ? 'noch nicht erstellt' : (showSecrets ? a.appKey : `${a.appKey.slice(0, 6)}…${a.appKey.slice(-6)}`)
    }));
  }

  function addAccount(input = {}) {
    const id = cleanId(input.id || input.name || `account_${accounts.length + 1}`);
    if (byId.has(id)) throw new Error('Account-ID existiert bereits.');
    // Neuer Account bekommt den App-Key erst, nachdem sein WhatsApp-QR wirklich gescannt wurde.
    const appKey = isBadKey(input.appKey || input.app_key) ? '' : String(input.appKey || input.app_key).trim();
    const cfg = {
      id,
      name: String(input.name || id).trim(),
      appKey,
      admin: Boolean(input.admin),
      enabled: true,
      provider: input.provider || process.env.PROVIDER || 'wwebjs',
      clientId: input.clientId || `own-messenger-${id}`,
      dbPath: input.dbPath || `./data/accounts/${id}/own_messenger.sqlite`,
      uploadDir: input.uploadDir || `./uploads/${id}`,
      createdAt: new Date().toISOString(),
      appKeyAcknowledged: false
    };
    const accountRoot = path.join(ACCOUNTS_DIR, cfg.id);
    fs.mkdirSync(accountRoot, { recursive: true });
    const db = createDb(cfg.dbPath);
    db.migrate();
    const provider = createProvider({
      accountId: cfg.id,
      accountName: cfg.name,
      providerName: cfg.provider,
      clientId: cfg.clientId,
      authDataPath: path.join(accountRoot, '.wwebjs_auth'),
      uploadDir: path.resolve(PROJECT_ROOT, cfg.uploadDir)
    });
    provider.accountId = cfg.id;
    provider.accountName = cfg.name;
    const account = { ...cfg, db, provider, keyHash: isBadKey(cfg.appKey) ? '' : hashKey(cfg.appKey), accountRoot };
    accounts.push(account);
    byId.set(account.id, account);
    if (account.keyHash) byKeyHash.set(account.keyHash, account);
    saveAccounts();
    return account;
  }


  function ensureAppKey(accountOrId) {
    const account = typeof accountOrId === 'string' ? byId.get(accountOrId) : accountOrId;
    if (!account) throw new Error('Account nicht gefunden.');
    if (!isBadKey(account.appKey)) {
      const keyHash = hashKey(account.appKey);
      const owner = byKeyHash.get(keyHash);
      if (!owner || owner.id === account.id) {
        account.keyHash = keyHash;
        byKeyHash.set(keyHash, account);
        return account.appKey;
      }
      // Gleicher Key in zwei Slots: fuer den aktuellen Slot sofort einen neuen erstellen.
      account.appKey = '';
    }
    const key = randomKey();
    account.appKey = key;
    account.keyHash = hashKey(key);
    account.appKeyAcknowledged = false;
    byKeyHash.set(account.keyHash, account);
    if (account.id === accounts[0]?.id) {
      process.env.APP_TOKEN = key;
      writeLegacyKeyFile(key);
    }
    saveAccounts();
    return key;
  }

  function acknowledgeAppKey(accountOrId) {
    const account = typeof accountOrId === 'string' ? byId.get(accountOrId) : accountOrId;
    if (!account) throw new Error('Account nicht gefunden.');
    account.appKeyAcknowledged = true;
    saveAccounts();
    return account;
  }

  repairDuplicateAppKeys();

  function getById(id) {
    return byId.get(String(id || '').trim()) || null;
  }

  function getDuplicateKeyRepairs() {
    return duplicateKeyRepairs.slice();
  }

  return { accounts, defaultAccount, getByToken, getById, listSafe, addAccount, ensureAppKey, acknowledgeAppKey, saveAccounts, getDuplicateKeyRepairs, accountsFile: ACCOUNTS_FILE, maxWaAccounts: MAX_WA_ACCOUNTS };
}

module.exports = { createAccountManager, hashKey, randomKey };
